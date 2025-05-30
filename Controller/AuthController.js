require("dotenv").config();
const User = require('../Model/Student');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
const FormData = require('form-data');
const PushToken = require('../Model/PushToken');
// Replace the Firebase Admin import and initialization
// const admin = require('firebase-admin');
// admin.initializeApp({ ... });

const admin = require('../firebase/admin');

const API_KEY = process.env.API_KEY || '1ed67ee114b6217894a2a1ca9f30784';  
const SCHOOL_API_KEY = process.env.SCHOOL_API_KEY || '8d4777c2-da71-408e-974d-daa29b142689';
const USERS_API_KEY = '1ed67ee114b6217894a2a1ca9f30784';

async function fetchSchools() {
    const formData = new FormData();
    formData.append('api_key', SCHOOL_API_KEY);
  
    try {
      const response = await axios.post(
        'https://app.edisha.org/index.php/resource/GetSchools',
        formData
      );
  
      if (response.data.status && Array.isArray(response.data.data)) {
        console.log(`Received ${response.data.data.length} schools`);
        return response.data.data;
      } else {
        console.error("❌ Invalid response from GetSchools API:", response.data);
        return [];
      }
    } catch (error) {
      console.error("❌ Error fetching schools:", error.message);
      return [];
    }
  }  
  

async function fetchSchoolUsers() {
    try {
        console.log('Fetching school users with API key:', API_KEY);
        
        // Make the direct API request with form-urlencoded
        const response = await axios({
            method: 'post',
            url: 'https://app.edisha.org/index.php/resource/GetUsers',
            data: `api_key=${API_KEY}`,
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded' 
            }
        });
        
        console.log(`School users API response status:`, response.data.status);
        
        if (response.data.status && Array.isArray(response.data.data)) {
            console.log(`Received ${response.data.data.length} users`);
            return response.data.data;
        }
        
        console.error("❌ Invalid response from school API:", response.data);
        return [];
    } catch (error) {
        console.error("❌ Error fetching school users:", error.message);
        console.error("❌ Error details:", error);
        return [];
    }
}

const generateParentId = async () => {
    let uniqueId;
    let exists;

    do {
        uniqueId = `P${Math.floor(1000 + Math.random() * 9000)}`; // Generates a 4-digit number prefixed with 'P'
        exists = await PushToken.findOne({ parentId: uniqueId }); // Check if ID already exists
    } while (exists); // Repeat if ID is not unique

    return uniqueId;
};

const registerParent = async (req, res) => {
    try {
        const { name, phoneNumber, password, pushToken, schoolId } = req.body;

        if (!name || !phoneNumber || !password || !pushToken || !schoolId) {
            return res.status(400).json({ message: "Name, phone number, password, push token, and school ID are required." });
        }

        // Validate that the school exists
        const schools = await fetchSchools();
        const schoolExists = schools.some(school => school.licence_id.toString() === schoolId.toString());
        
        if (!schoolExists) {
            return res.status(400).json({ message: "Invalid school ID. Please select a valid school." });
        }

        let parent = await PushToken.findOne({ phoneNumber });

        if (parent) {
            parent.name = name;
            parent.pushToken = pushToken; // Update push token
            parent.schoolId = schoolId; // Update school ID
            await parent.save();
        } else {
            const parentId = await generateParentId(); // Generate unique parentId

            parent = new PushToken({
                parentId, // Set unique 4-digit parentId
                name,
                phoneNumber,
                password, // Password will be hashed by the schema middleware
                pushToken,
                schoolId,
                students: []
            });
            await parent.save();
        }

        res.status(200).json({ message: "Parent registered successfully.", parent });
    } catch (error) {
        console.error("Error registering parent:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

const loginParent = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        if (!phoneNumber || !password) {
            return res.status(400).json({ message: "Phone number and password are required." });
        }

        console.log('Attempting login for phone number:', phoneNumber);
        const parent = await PushToken.findOne({ phoneNumber });
        console.log(parent)
        if (!parent) {
            console.log('Parent not found for phone number:', phoneNumber);
            return res.status(404).json({ message: "Parent not found. Please register first." });
        }

        console.log('Found parent, comparing passwords...');
        // Compare the provided password with the hashed password
        const isPasswordValid = await bcrypt.compare(password, parent.password);
        console.log('Password comparison result:', isPasswordValid);
        
        if (!isPasswordValid) {
            console.log('Invalid password for parent:', phoneNumber);
            return res.status(401).json({ message: "Invalid password" });
        }

        console.log('Login successful for parent:', phoneNumber);
        res.status(200).json({ message: "Login successful.", parent });
    } catch (error) {
        console.error("Error logging in parent:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

async function validateStudentInSchool(studentId) {
    const formData = new FormData();
    formData.append('api_key', '1ed67ee114b62178f94a2a1ca9f30784');
  
    try {
      const response = await axios.post(
        'https://app.edisha.org/index.php/resource/GetUsers',
        formData
      );
  
      if (response.data.status && Array.isArray(response.data.data)) {
        const studentIdStr = String(studentId).trim();
        const foundUser = response.data.data.find(user => String(user.user_id).trim() === studentIdStr);
        console.log(`Validation result for student ${studentId}: ${!!foundUser}`);
        return !!foundUser;
      } else {
        console.error("❌ Invalid response from GetUsers API:", response.data);
        return false;
      }
    } catch (error) {
      console.error("❌ Error validating student:", error.message);
      return false;
    }
  }


const addStudent = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No authentication token provided" });
        }

        const { studentId, studentName, className, schoolId } = req.body;
        console.log('Received student data:', { studentId, studentName, className, schoolId });

        if (!studentId || !studentName) {
            return res.status(400).json({ message: "Student ID and student name are required." });
        }

        // Find parent by token (which is the _id)
        let parent = await PushToken.findById(token);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found" });
        }

        console.log('Parent data:', {
            parentId: parent.parentId,
            schoolId: parent.schoolId,
            requestSchoolId: schoolId
        });

        // Validate student exists in system - for now just check if the ID exists at all
        const isValidStudent = await validateStudentInSchool(studentId);
        if (!isValidStudent) {
            return res.status(400).json({ 
                message: "Student ID not found in the system. Please check the ID and try again." 
            });
        }

        // Check if the student already exists in the parent's account
        const studentExists = parent.students.some(s => s.studentId === studentId);
        if (!studentExists) {
            // Ensure className is not empty
            const validClassName = className && className.trim() !== '' ? className : 'Class Not Specified';
            console.log('Adding new student with class name:', validClassName);
            
            // Use the parent's schoolId if available, otherwise use the one from the request
            const validSchoolId = parent.schoolId || schoolId || '';
            
            parent.students.push({ 
                studentId, 
                studentName,
                className: validClassName,
                schoolId: validSchoolId,
                notificationsEnabled: false
            });
            await parent.save();
            console.log(`Student ${studentId} added successfully for parent ${parent.parentId}`);
        } else {
            // Update existing student's information if provided
            const studentIndex = parent.students.findIndex(s => s.studentId === studentId);
            if (className && className.trim() !== '') {
                console.log('Updating existing student class name to:', className);
                parent.students[studentIndex].className = className;
                await parent.save();
                console.log(`Student ${studentId} updated successfully`);
            }
        }

        console.log('Student data after save:', JSON.stringify(parent.students));
        res.status(200).json({ message: "Student added successfully.", parent });
    } catch (error) {
        console.error("Error adding student:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

const deleteStudent = async (req, res) => {
    try {
        const { phoneNumber, studentId } = req.body;

        if (!phoneNumber || !studentId) {
            return res.status(400).json({ message: "Phone number and student ID are required." });
        }

        let parent = await ParentPushToken.findOne({ phoneNumber });
        if (!parent) {
            return res.status(404).json({ message: "Parent not found." });
        }

        parent.students = parent.students.filter(student => student.studentId !== studentId);
        await parent.save();

        res.status(200).json({ message: "Student deleted successfully.", parent });
    } catch (error) {
        console.error("Error deleting student:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

const getStudents = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No authentication token provided" });
        }

        // Find parent by token (which is the _id)
        const parent = await PushToken.findById(token);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found" });
        }

        res.status(200).json({ parent });
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const updateNotificationPreference = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No authentication token provided" });
        }

        const { studentId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ message: "Enabled status must be a boolean" });
        }

        // Find parent by token (which is the _id)
        const parent = await PushToken.findById(token);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found" });
        }

        // Find the student in the parent's students array
        const studentIndex = parent.students.findIndex(s => s.studentId === studentId);
        if (studentIndex === -1) {
            return res.status(404).json({ message: "Student not found" });
        }

        // Update the student's notification preference
        parent.students[studentIndex].notificationsEnabled = enabled;
        await parent.save();

        console.log(`Notification preference updated for student ${studentId} to ${enabled}`);
        console.log(`Updated student data: ${JSON.stringify(parent.students[studentIndex])}`);

        res.status(200).json({ 
            message: "Notification preference updated successfully",
            student: parent.students[studentIndex]
        });
    } catch (error) {
        console.error("Error updating notification preference:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const sendTestNotification = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No authentication token provided" });
        }

        // Find parent by token (which is the _id)
        const parent = await PushToken.findById(token);
        if (!parent) {
            return res.status(404).json({ message: "Parent not found" });
        }

        if (!parent.pushToken) {
            return res.status(400).json({ message: "No push token found for this user" });
        }

        // Send test notification using Firebase Admin SDK
        const message = {
            token: parent.pushToken,
            notification: {
                title: "Test Notification",
                body: "This is a test notification from the app!",
            },
            data: {
                type: "test",
                timestamp: new Date().toISOString(),
            },
        };

        try {
            const response = await admin.messaging().send(message);
            console.log('Successfully sent test notification:', response);
            res.status(200).json({ 
                message: "Test notification sent successfully",
                response: response
            });
        } catch (error) {
            console.error('Error sending test notification:', error);
            res.status(500).json({ 
                message: "Failed to send test notification",
                error: error.message
            });
        }
    } catch (error) {
        console.error("Error in test notification:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getSchools = async (req, res) => {
    try {
        const schools = await fetchSchools();
        res.status(200).json({ 
            message: "Schools fetched successfully",
            schools: schools
        });
    } catch (error) {
        console.error("Error fetching schools:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    registerParent,
    loginParent,
    addStudent,
    deleteStudent,
    getStudents,
    getSchools,
    updateNotificationPreference,
    sendTestNotification
};