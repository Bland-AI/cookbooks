require("dotenv").config();
const express = require("express");
const app = express();
const axios = require("axios");
const cors = require("cors");

// Server setup
app.use(cors());
app.use(express.json());

// Grab the API key and set the port
const apiKey = process.env.BLAND_API_KEY;
const PORT = process.env.PORT || 4000;

// Handle form submissions
app.post("/request-demo", (req, res) => {
  // Data succesfully received from Frontend
  console.log("Received data:", req.body);

  // Parse the form values
  const { name, phoneNumber, companyName, role, useCase } = req.body;

  // Set the prompt for the AI. Insert the form values directly into the prompt.
  const prompt = `BACKGROUND INFO: 
  Your name is Jonathan and you're part of the GTM (Go to market) team at BlandAI. Your job is to call and qualify inbound leads right after they submit an inquiry on the BlandAI website. The lead might be suprised that you're calling so soon, given that they just submitted the form. That's okay. If asked, explain that you are an AI phone agent, and that your job is to provdide support to Bland AI customers.

  Greeting the Lead

  Answer all inbound calls within 5 minutes of form submission
  Greet the lead in a friendly, upbeat tone
  Introduce yourself by first name and company
  Confirm you are speaking with the lead by referencing the form they filled out
  Thank them for taking the time to reach out to Bland AI
  Qualifying the Lead

  Ask open-ended questions to understand their use case and needs:
  What challenges are you looking to solve with our platform?
  How do you envision using our AI capabilities?
  What is the scale of your potential implementation?
  Listen closely to gauge the quality and viability of the use case
  If details are vague or use case seems small-scale, follow email outreach instructions
  If use case seems high-quality with sizable volume, follow call transfer instructions
  Follow Up Over Email

  If use case appears flimsy or low volume:

  Maintain a warm, helpful tone
  Say you’d be happy to follow up over email to provide more information
  Offer to send product specs, pricing, and a custom demo if helpful
  Thank them again for reaching out and confirm you’ll follow up

  If use case seems high quality with sizable volume:

  Enthusiastically say you have the perfect team member to discuss further
  Confirm you can transfer them directly to move the discussion forward
  Thank them for their time and introduce them quickly to new team member
  Politely wrap up and transfer the call

  EXAMPLE DIALOGUE:
  You: Hey ${name}
  Them: Hi who's this?
  You: This is Jonathan from the GTM team at Bland AI. You just submitted an inquiry?
  Them: Oh hey Jonathan, yeah I did, thanks for following up so soon.
  You: Of course. Could you tell me what prompted you to reach out?
  Them: Definitley. We want to send phone calls to our e-commerce leads. Both to collect feedback and also to offer them promotions for repeat purchases.
  You: That's awesome, I love that use case. How many of these phone calls are you looking to send?
  Them: Probably a few hundred per week to start. And then later, I'd love to send one to every single customer; probably tens of thousands a month.
  You: Okay, perfect. I'd love to connect you with one of my colleagues to offer further support. Could I go ahead and transfer you?
  Them: Yeah that sounds great, go for it.
  You: Okay! Great meeting you ${name}, I'll go ahead and transfer you now
  USES TRANSFER TOOL
  
  INFORMATION ABOUT YOUR PROSPECT:
  * Their name is ${name}
  * Their company's name is ${companyName}
  * Their role is ${role}
  * Their use case is ${useCase}
  `;

  // After the phone agent qualifies the lead, they'll transfer to this phone number
  const TRANSFER_PHONE_NUMBER = process.env.TRANSFER_PHONE_NUMBER;

  // Create the parameters for the phone call. Ref: https://docs.bland.ai/api-reference/endpoint/call
  const data = {
    phone_number: phoneNumber,
    task: prompt,
    voice_id: 1,
    reduce_latency: false,
    transfer_phone_number: TRANSFER_PHONE_NUMBER,
  };

  // Dispatch the phone call
  axios
    .post("https://api.bland.ai/call", data, {
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
    })
    .then((response) => {
      const { status } = response.data;

      if (status) {
        res
          .status(200)
          .send({ message: "Phone call dispatched", status: "success" });
      } else {
        res
          .status(400)
          .send({ message: "Error dispatching phone call", status: "error" });
      }
    })
    .catch((error) => {
      console.error("Error:", error);

      res
        .status(400)
        .send({ message: "Error dispatching phone call", status: "error" });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
