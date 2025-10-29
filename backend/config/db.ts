import dotenv from "dotenv";
dotenv.config()
import mongoose from "mongoose";

function connectDatabse() {
    mongoose.connect(process.env.DB_URL || "").then(
        () => { console.log("connected succesfully") }
    ).catch(err => {
        console.log(err);
    });
}

export default connectDatabse;