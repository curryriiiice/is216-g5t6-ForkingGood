import express from 'express';
import cors from "cors";
import env from "dotenv";
env.config();


const app = express();


// for parsing JSON bodies
app.use(express.json()); 

// this allows all origins, replace it before deployment
app.use(cors()); 

// replace it with this! 
// app.use(cors({
//   origin: "http://localhost:3000", 
//   credentials: true
// }));

// for parsing URL-encoded form data
app.use(express.urlencoded({ extended: true })); 

// check if server is running
app.listen(8000, () => console.log('Server running on port http://localhost:8000'));


