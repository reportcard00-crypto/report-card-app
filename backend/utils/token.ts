import jwt from 'jsonwebtoken';
export function generateToken(userId: string): string {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined in environment variables.");
    }
	return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "365d" });
}
