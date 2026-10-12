import dotenv from 'dotenv';
import { storage } from './storage';
dotenv.config();

export interface SmsSendResult {
  sent: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  liveCellularDelivered: boolean;
}

/**
 * Dispatches an SMS OTP to a phone number.
 * Supports:
 * 1. Fast2SMS (Indian SMS Gateway - fast2sms.com)
 * 2. Twilio SMS
 * 3. Custom SMS Webhook
 */
export async function sendSmsOtp(phone: string, otp: string, recipientName = 'Employee'): Promise<SmsSendResult> {
  const message = `Your Chronos Attendance verification code is ${otp}. Valid for 5 minutes. Do not share this code.`;
  const gatewaySettings = storage.getSmsGatewaySettings();

  // 1. Check Fast2SMS
  const fast2SmsKey = process.env.FAST2SMS_API_KEY || gatewaySettings.fast2SmsApiKey;
  if (fast2SmsKey && fast2SmsKey.trim()) {
    try {
      const indianPhone = phone.replace(/\D/g, '').slice(-10);
      
      // Primary: Use Fast2SMS Quick SMS Route ('q') which requires no DLT website verification
      let res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': fast2SmsKey.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          flash: 0,
          numbers: indianPhone,
        }),
      });

      let data = await res.json();

      // If Quick route failed, try OTP route ('otp') as fallback
      if (!data.return) {
        res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': fast2SmsKey.trim(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers: indianPhone,
          }),
        });
        const otpData = await res.json();
        if (otpData.return) {
          data = otpData;
        }
      }

      if (data.return) {
        console.log(`[SMS-DISPATCH] Fast2SMS successfully delivered to ${indianPhone}: ${data.request_id || 'OK'}`);
        storage.setLastDispatchedSms({
          phone,
          code: otp,
          provider: 'Fast2SMS (Cellular)',
          status: 'Delivered to Cellular Network',
        });
        return { 
          sent: true, 
          provider: 'Fast2SMS', 
          messageId: data.request_id, 
          liveCellularDelivered: true 
        };
      } else {
        const errorMsg = typeof data.message === 'string' 
          ? data.message 
          : Array.isArray(data.message) 
            ? data.message.join(', ') 
            : 'Fast2SMS dispatch pending';
        
        console.log(`[SMS-DISPATCH] Fast2SMS notice: ${errorMsg}`);
        storage.setLastDispatchedSms({
          phone,
          code: otp,
          provider: 'Fast2SMS',
          status: errorMsg,
        });
        return { 
          sent: false, 
          provider: 'Fast2SMS', 
          error: errorMsg, 
          liveCellularDelivered: false 
        };
      }
    } catch (err: any) {
      console.log(`[SMS-DISPATCH] Fast2SMS error: ${err.message}`);
    }
  }

  // 2. Check Twilio
  const twilioSid = process.env.TWILIO_ACCOUNT_SID || gatewaySettings.twilioSid;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN || gatewaySettings.twilioAuthToken;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER || gatewaySettings.twilioPhoneNumber;

  if (twilioSid && twilioAuth && twilioFrom) {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '').slice(-10)}`;
      const authHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', formattedPhone);
      params.append('From', twilioFrom);
      params.append('Body', message);

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await res.json();
      if (res.ok && data.sid) {
        console.log(`[SMS-DISPATCH] Twilio delivered to ${formattedPhone}: ${data.sid}`);
        storage.setLastDispatchedSms({
          phone,
          code: otp,
          provider: 'Twilio (Cellular)',
          status: 'Delivered to Carrier',
        });
        return { sent: true, provider: 'Twilio', messageId: data.sid, liveCellularDelivered: true };
      } else {
        storage.setLastDispatchedSms({
          phone,
          code: otp,
          provider: 'Twilio',
          status: data.message || 'Error',
        });
        return { sent: false, provider: 'Twilio', error: data.message, liveCellularDelivered: false };
      }
    } catch (err: any) {
      console.log(`[SMS-DISPATCH] Twilio error: ${err.message}`);
    }
  }

  // 3. Fallback: Log to storage
  console.log(`[SMS-DISPATCH] OTP generated for Phone: ${phone} (Code: ${otp})`);
  storage.setLastDispatchedSms({
    phone,
    code: otp,
    provider: 'Server Gateway',
    status: 'Generated on Server',
  });

  return {
    sent: true,
    provider: 'Server Gateway',
    liveCellularDelivered: false,
    error: 'Awaiting SMS Gateway configuration.',
  };
}
