import  type { UserModel } from "./userModel";
import type { Request } from "express";

export type CustomRequest = Request & {
    user?: UserModel;  
};  