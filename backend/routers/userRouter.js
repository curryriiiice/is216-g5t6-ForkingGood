import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
	getPostbyId,
	getUsernamebyEmail,

}from '../controllers/userController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getPostbyId", getPostbyId);
router.post("/getUsernamebyEmail", getUsernamebyEmail);


export default router;