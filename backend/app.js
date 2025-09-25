import express from 'express';
// import env from "dotenv";
// env.config();

const app = express();


// for parsing JSON bodies
app.use(express.json()); 


// check if server is running
app.listen(8000, () => console.log('Server running on port http://localhost:8000'));


