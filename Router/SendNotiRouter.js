const express = require("express");
const router=express.Router();

const {sendNotification,SendNotificationToAll,sendFCMNotificationToParent,testSendFCMNotification,getNotificationLogs} = require("../Controller/SendNotiController")

router.post("/send-notifications",sendNotification );
router.post("/notify-all-school-users",SendNotificationToAll );
router.post("/notify",sendFCMNotificationToParent );
router.post('/test-notification', testSendFCMNotification);
router.get('/notification-logs', getNotificationLogs);

module.exports=router;
