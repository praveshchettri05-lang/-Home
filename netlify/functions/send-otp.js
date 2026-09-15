const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email, otp } = JSON.parse(event.body);

    if (!email || !otp) {
      return { statusCode: 400, body: 'Missing email or otp' };
    }

    // Ensure environment variables are set
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_EMAIL_PASSWORD) {
      console.warn("ADMIN_EMAIL or ADMIN_EMAIL_PASSWORD is not set in environment variables.");
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          success: true, 
          message: 'Simulation mode: Environment variables not set. Email not sent, but OTP generated.',
          simulated: true 
        }) 
      };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.ADMIN_EMAIL,
        pass: process.env.ADMIN_EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"2nd Home Admin" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: 'Your Admin Portal OTP - 2nd Home',
      text: `Your OTP for the 2nd Home Admin Portal is: ${otp}\n\nDo not share this with anyone.`,
      html: `<h3>2nd Home Admin Portal</h3><p>Your OTP is: <strong style="font-size:24px;color:#c9a84c;">${otp}</strong></p><p>Do not share this with anyone.</p>`
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'OTP sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to send OTP email.' }),
    };
  }
};
