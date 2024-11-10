CREATE TABLE calls (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(255),
    customer_name VARCHAR(255),
    company_name VARCHAR(255),
    phone_number VARCHAR(255),
    transcript TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 