// This is the code for your secure serverless function.
// It has been updated to use your custom "Forge Lead Status" property in HubSpot.

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fetch = require('node-fetch');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const propertyData = JSON.parse(event.body);
  const { 
    GOOGLE_AI_API_KEY, 
    HUBSPOT_API_KEY,
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY
  } = process.env;

  try {
    // --- Step 1: Get the AI Price Estimate ---
    const aiEstimate = await getAIPriceEstimate(propertyData, GOOGLE_AI_API_KEY);
    
    // --- Step 2: Initialize Firebase Admin and save the lead ---
    const firebaseCredentials = {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
    await saveLeadToFirestore(propertyData, aiEstimate, firebaseCredentials);

    // --- Step 3: Add the contact to HubSpot ---
    await addContactToHubspot(propertyData, aiEstimate, HUBSPOT_API_KEY);
    
    // --- Step 4: Return the successful estimate to the website ---
    return {
      statusCode: 200,
      body: JSON.stringify(aiEstimate)
    };

  } catch (error) {
    console.error('Error in serverless function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function saveLeadToFirestore(leadData, estimate, firebaseCredentials) {
    if (!getApps().length) {
        initializeApp({
            credential: cert(firebaseCredentials),
        });
    }
    
    const db = getFirestore();
    const leadWithEstimate = { ...leadData, ...estimate, createdAt: new Date() };

    await db.collection('leads').add(leadWithEstimate);
    console.log('Successfully saved lead to Firestore.');
}

async function getAIPriceEstimate(property, apiKey) {
    const prompt = `Act as a real estate market analyst. Based on the following property details, provide a single estimated market value, a low-end value, and a high-end value.
        - Property: ${property.address}, ${property.city}, ${property.state}, USA
        - Specs: ${property.bedrooms} beds, ${property.bathrooms} baths, ${property.sqft} sqft
        - Condition: ${property.condition}
    `;
    const schema = { 
        type: "OBJECT", 
        properties: { 
            "estimatedValue": { "type": "NUMBER" },
            "lowValue": { "type": "NUMBER" },
            "highValue": { "type": "NUMBER" }
        }, 
        required: ["estimatedValue", "lowValue", "highValue"]
    };
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`AI API call failed: ${response.statusText}`);
    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
}

async function addContactToHubspot(leadData, estimate, apiKey) {
    const hubspotPayload = {
        properties: {
          email: leadData.email,
          firstname: leadData.name.split(' ')[0],
          lastname: leadData.name.split(' ').slice(1).join(' '),
          address: `${leadData.address}, ${leadData.city}, ${leadData.state}`,
          // This is the updated property name
          forge_lead_status: "NEW", 
          automated_price_estimate: estimate.estimatedValue
        }
    };
    const hubspotApiUrl = 'https://api.hubapi.com/crm/v3/objects/contacts';
    const response = await fetch(hubspotApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(hubspotPayload)
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HubSpot API Error: ${response.status} ${errorBody}`);
    }
    console.log('Successfully created contact in Hubspot.');
}
