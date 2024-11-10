require("dotenv").config();
const express = require("express");
const app = express();
const axios = require("axios");
const cors = require("cors");
const db = require('./db');

// Server setup
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Grab the API key and set the port
const apiKey = process.env.BLAND_API_KEY;
const encryptedKey = process.env.ENCRYPTED_KEY;
const PORT = process.env.PORT || 4000;

// Add this debug log
console.log("API Key present:", !!process.env.BLAND_API_KEY);
console.log("Encrypted Key present:", !!process.env.ENCRYPTED_KEY);

// At the top of your file, after loading dotenv
console.log("Environment variables:", {
  apiKey: process.env.BLAND_API_KEY?.slice(0, 4) + "...",  // Only show first 4 chars
  encryptedKey: process.env.ENCRYPTED_KEY ? "present" : "missing"
});

// Add this near the top after loading dotenv
console.log("Environment variables loaded:", {
  BLAND_API_KEY: process.env.BLAND_API_KEY ? "present" : "missing",
  ENCRYPTED_KEY: process.env.ENCRYPTED_KEY ? "present" : "missing"
});

// Function to fetch and store call details
async function fetchAndStoreCallDetails(callId) {
  console.log("Fetching details for call:", callId);

  try {
    const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BLAND_API_KEY}`,
        "X-Bland-Encrypted-Key": process.env.ENCRYPTED_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log("API Response:", response.data);

    // Get transcript with emojis
    let transcript = response.data.concatenated_transcript;
    if (!transcript && response.data.transcripts && response.data.transcripts.length > 0) {
      transcript = response.data.transcripts.map(t => {
        // Add emoji based on who's speaking
        const emoji = t.user === 'assistant' ? '👨‍💼 ' : '👤 ';
        return `${emoji}${t.user === 'assistant' ? 'Jonathan' : 'Customer'}: ${t.text}`;
      }).join('\n');
    } else if (transcript) {
      // Format the concatenated transcript with emojis
      transcript = transcript.split('\n').map(line => {
        if (line.trim().startsWith('assistant:')) {
          return `👨‍💼 Jonathan: ${line.replace('assistant:', '').trim()}`;
        } else if (line.trim().startsWith('user:')) {
          return `👤 Customer: ${line.replace('user:', '').trim()}`;
        }
        return line;
      }).join('\n');
    }

    // If call is completed, store details
    if (response.data.status === "completed") {
      const duration = parseFloat(response.data.corrected_duration) || 0;
      
      await db.query(
        'UPDATE calls SET transcript = COALESCE($1, transcript), recording_url = $2, call_status = $3, duration = $4 WHERE call_id = $5',
        [
          transcript,
          response.data.recording_url,
          response.data.status,
          duration,
          callId
        ]
      );
      console.log("Call details stored successfully");
      return true;
    } else {
      // Store partial transcript if available
      if (transcript) {
        await db.query(
          'UPDATE calls SET transcript = $1 WHERE call_id = $2 AND (transcript IS NULL OR transcript = \'\')',
          [transcript, callId]
        );
      }
      
      // If call not completed, retry after 30 seconds
      console.log("Call status:", response.data.status);
      setTimeout(() => fetchAndStoreCallDetails(callId), 30000);
      return false;
    }
  } catch (error) {
    console.error("Error details:", {
      message: error.message,
      response: error.response?.data,
      callId: callId
    });
    return false;
  }
}

// Handle form submissions
app.post("/request-demo", async (req, res) => {
  // Data succesfully received from Frontend
  console.log("Received data:", req.body);

  // Parse the form values
  const { name, phoneNumber, companyName, role, useCase } = req.body;

  // Set the prompt for the AI in French
  const prompt = `GENERAL INFORMATION:
  You are Jonathan from Babou Cooperations' GTM (Go-to-Market) team. You're an AI sales development representative focused on qualifying inbound leads. Be professional but friendly, and speak naturally with brief pauses.

  PROSPECT INFORMATION:
  * Name: ${name}
  * Company: ${companyName}
  * Role: ${role}
  * Initial Interest: ${useCase}

  CONVERSATION FLOW:
  1. Introduction:
     - Greet them by name
     - Mention you're following up on their website inquiry
     - Acknowledge the quick response time if they mention it

  2. Qualification Questions (ask these naturally throughout the conversation):
     - What specific challenges are they facing in their business?
     - What are their current marketing/advertising strategies?
     - What are their main business goals for the next 6-12 months?
     - What's their timeline for implementing new solutions?
     - What's their budget range for this project?

  3. Value Proposition:
     - Babou Cooperations specializes in AI-driven marketing solutions
     - We help businesses increase online visibility and customer acquisition
     - Our solutions are customized based on industry and business size
     - We've helped similar companies achieve [mention relevant success metrics]

  4. Next Steps:
     - If qualified: Transfer to specialist (explain you're connecting them with our solutions expert)
     - If not qualified: Provide relevant resources and maintain relationship

  TRANSFER INFORMATION:
  - When ready to transfer, say: "I'd like to connect you with our solutions specialist who can provide more detailed information about our services and pricing. Is that okay?"
  - Then initiate the transfer

  IMPORTANT GUIDELINES:
  - Listen actively and adapt to their responses
  - Don't rush through qualification questions
  - Be transparent about being an AI assistant if asked
  - Keep responses concise but informative
  - Show genuine interest in their business challenges
  `;

  // After the phone agent qualifies the lead, they'll transfer to this phone number
  const TRANSFER_PHONE_NUMBER = "+18506084580";

  // Create the parameters for the phone call. Ref: https://docs.bland.ai/api-reference/endpoint/call
  const data = {
    phone_number: phoneNumber,
    task: prompt,
    voice_id: 1,
    reduce_latency: false,
    transfer_phone_number: TRANSFER_PHONE_NUMBER,
    language: "en",
    record: true,
    temperature: 0.7,
    first_message: `Hello ${name}, this is Jonathan from Babou Cooperations. I noticed you recently submitted an inquiry about our services - is this a good time to talk?`
  };

  try {
    // Create database entry first
    const dbResult = await db.query(
      'INSERT INTO calls (customer_name, company_name, phone_number) VALUES ($1, $2, $3) RETURNING id',
      [name, companyName, phoneNumber]
    );

    // Then make the API call
    const response = await axios.post("https://api.bland.ai/call", data, {
      headers: {
        "Authorization": `Bearer ${process.env.BLAND_API_KEY}`,
        "X-Bland-Encrypted-Key": process.env.ENCRYPTED_KEY,
        "Content-Type": "application/json",
      },
    });

    // Update the record with the call_id
    await db.query(
      'UPDATE calls SET call_id = $1 WHERE id = $2',
      [response.data.call_id, dbResult.rows[0].id]
    );

    // Start fetching call details after 30 seconds
    setTimeout(() => fetchAndStoreCallDetails(response.data.call_id), 30000);

    res.status(200).json({
      message: "Call initiated successfully",
      call_id: response.data.call_id
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Add this new endpoint to handle webhooks
app.post("/webhook", async (req, res) => {
  const transcript = req.body.transcript;
  const callId = req.body.call_id;

  try {
    await db.query(
      'UPDATE calls SET transcript = $1, updated_at = CURRENT_TIMESTAMP WHERE call_id = $2',
      [transcript, callId]
    );
    console.log("Call completed - Transcript saved");
    res.status(200).send({ status: "success" });
  } catch (error) {
    console.error("Error saving transcript:", error);
    res.status(500).send({ status: "error" });
  }
});

// Add this new endpoint to fetch transcript manually
app.get("/get-transcript/:callId", async (req, res) => {
  const callId = req.params.callId;

  try {
    const response = await axios.get(`https://api.bland.ai/calls/${callId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BLAND_API_KEY}`,
        "X-Bland-Encrypted-Key": process.env.ENCRYPTED_KEY,
      },
    });

    const transcript = response.data.transcript;
    res.status(200).send({ transcript });
  } catch (error) {
    console.error("Error fetching transcript:", error);
    res.status(400).send({ message: "Error fetching transcript", status: "error" });
  }
});

// Add endpoint to get call history
app.get("/calls", async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM calls ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

app.get("/call-media/:callId", async (req, res) => {
  const callId = req.params.callId;
  console.log("Fetching call media for:", callId);

  try {
    // Most basic endpoint structure
    const response = await axios.get(`https://api.bland.ai/call/${callId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BLAND_API_KEY}`,
        "X-Bland-Encrypted-Key": process.env.ENCRYPTED_KEY,
      },
    });

    console.log("API Response:", response.data);

    res.status(200).send(response.data);
  } catch (error) {
    // Let's log the actual API key (first few characters) to verify it's correct
    const apiKey = process.env.BLAND_API_KEY;
    console.log("API Key starts with:", apiKey.substring(0, 10) + "...");

    console.error("Error details:", error.message);
    res.status(400).send({
      error: "Failed to fetch call media",
      message: error.message
    });
  }
});

app.get("/formatted-transcript/:callId", async (req, res) => {
  const callId = req.params.callId;

  try {
    // Get the transcript from your database
    const result = await db.query(
      'SELECT transcript FROM calls WHERE call_id = $1',
      [callId]
    );

    if (result.rows[0]?.transcript) {
      // Format the transcript
      const transcript = result.rows[0].transcript;
      const conversations = transcript.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('assistant:')) {
          return `\n👨‍💼 Jonathan: ${trimmed.replace('assistant:', '')}\n`;
        } else if (trimmed.startsWith('user:')) {
          return `👤 Customer: ${trimmed.replace('user:', '')}\n`;
        }
        return trimmed;
      }).join('');

      res.status(200).send({
        formatted_transcript: conversations,
        raw_transcript: transcript
      });
    } else {
      res.status(404).send({ message: "Transcript not found" });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: "Failed to fetch transcript" });
  }
});

// Get all calls with transcripts and recordings
app.get("/calls-with-media", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT customer_name, transcript, recording_url, created_at, call_status 
      FROM calls 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Get details for a specific call
app.get("/call/:id", async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM calls WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Call not found' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// Add this route to check call details directly
app.get("/check-call/:callId", async (req, res) => {
  try {
    const callId = req.params.callId;
    const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BLAND_API_KEY}`,
        "X-Bland-Encrypted-Key": process.env.ENCRYPTED_KEY,
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
