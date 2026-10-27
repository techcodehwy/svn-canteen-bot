const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// --- 1. YOUR CONFIGURATION ---
const TELEGRAM_TOKEN = '8627151643:AAGDfiGdu1DGP5yAkIwSx7ffzO2YG0mFwIE';
const SERVER_URL = 'https://svn-canteen-bot.onrender.com'; // Update this once Render gives you a live URL

// PHONEPE SANDBOX (TESTING) CREDENTIALS
const PHONEPE_MERCHANT_ID = 'PGTESTPAYUAT'; 
const PHONEPE_SALT_KEY = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399'; 
const PHONEPE_SALT_INDEX = '1';
const PHONEPE_ENV_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';

// --- 2. LISTEN FOR TELEGRAM COMMANDS ---
app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200); // Instantly tell Telegram we received the message
    
    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Trigger when parent types "/recharge"
    if (text.startsWith('/recharge')) {
        const amountInPaise = 5200; // ₹52.00 (PhonePe reads amounts in paise)
        const transactionId = 'TXN_' + Date.now();

        // 2a. Build PhonePe Payload
        const payload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: transactionId,
            merchantUserId: "STUDENT_" + chatId,
            amount: amountInPaise,
            redirectUrl: `https://t.me/your_bot_username`, // Sends parent back to Telegram
            redirectMode: "REDIRECT",
            callbackUrl: `${SERVER_URL}/phonepe-webhook`, // Where PhonePe sends success data
            paymentInstrument: { type: "PAY_PAGE" }
        };

        // 2b. PhonePe Bank-Level Encryption (X-VERIFY)
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const stringToHash = base64Payload + '/pg/v1/pay' + PHONEPE_SALT_KEY;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const xVerify = `${sha256}###${PHONEPE_SALT_INDEX}`;

        // 2c. Ask PhonePe for the Link
        try {
            const response = await axios.post(PHONEPE_ENV_URL, { request: base64Payload }, { 
                headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify } 
            });

            const checkoutUrl = response.data.data.instrumentResponse.redirectInfo.url;

            // 2d. Send the [Pay ₹52] button back to Telegram
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: "Here is your SVN Canteen recharge link (Platform Fee included):",
                reply_markup: { inline_keyboard: [[ { text: "Pay ₹52", url: checkoutUrl } ]] }
            });

        } catch (error) {
            console.error("PhonePe Error:", error.message);
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: "Gateway unavailable. Please try again later."
            });
        }
    }
});

// --- 3. LISTEN FOR PHONEPE SUCCESS PING ---
app.post('/phonepe-webhook', async (req, res) => {
    res.sendStatus(200); 
    
    if (req.body.response) {
        // Decode PhonePe's encrypted response
        const decodedString = Buffer.from(req.body.response, 'base64').toString('utf-8');
        const jsonResponse = JSON.parse(decodedString);

        if(jsonResponse.success === true) {
            // Extract the Chat ID we attached earlier
            const chatId = jsonResponse.data.merchantUserId.split('_')[1];
            
            // Send final success receipt to parent
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: "✅ Recharge Successful! ₹50 has been added to the canteen balance."
            });
        }
    }
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SVN Canteen Bot running on port ${PORT}`);
});