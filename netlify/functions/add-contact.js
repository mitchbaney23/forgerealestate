// This is the code for your secure serverless function.

exports.handler = async function(event) {
  // Don't proceed if the request isn't a POST request.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get the lead data that the website sent.
  const leadData = JSON.parse(event.body);
  const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;

  const hubspotPayload = {
    properties: {
      email: leadData.email,
      firstname: leadData.firstname,
      lastname: leadData.lastname,
      address: leadData.address,
      city: leadData.city,
      state: leadData.state,
      num_bedrooms: leadData.bedrooms,
      num_bathrooms: leadData.bathrooms,
      square_footage: leadData.sqft,
      property_condition: leadData.condition,
      automated_price_estimate: leadData.estimatedPrice,
      lead_status: "NEW"
    }
  };

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(hubspotPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HubSpot API Error: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    console.log('Successfully created contact in Hubspot:', data);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Contact added successfully!', data: data.id })
    };

  } catch (error) {
    console.error('Error sending data to Hubspot:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to add contact to CRM.' })
    };
  }
};
