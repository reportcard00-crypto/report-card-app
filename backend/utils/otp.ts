import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export function generateOTP(): string {
	return Math.floor(1000 + Math.random() * 9000).toString();
}
export async function sendPhoneOtp(phone: string, phoneOtp: string) {
    try {
      const url = `https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/${phone}/${phoneOtp}`;
      const response = await axios.get(url);
  
      if (response.status === 200) {
        console.log(`SMS sent successfully to ${phone}`);
        return phoneOtp;
      } else {
        throw new Error("Failed to send SMS");
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      return null;
    }
}