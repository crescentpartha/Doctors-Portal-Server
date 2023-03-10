const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// import modules for email sending
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// connection setup with database with secure password on environment variable
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nywkbwu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// 04(ii). Verify JWT Token and handle unauthorized access | verifyJWT middleware
function verifyJWT(req, res, next) {
  // console.log('abc');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized Access' });
  }
  const token = authHeader.split(' ')[1];
  // verify a token symmetric
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access' });
    }
    // console.log(decoded);
    req.decoded = decoded;
    next();
  });
}

// where send email (permission of which user) | set options of email
const emailSenderOptions = {
  auth: {
    api_key: process.env.DOCTOR_PORTAL_EMAIL_SENDER_API_KEY
  }
}

// set connection of client with clientEmail | connect client of email
const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

// create function from where to send email
function sendAppointmentEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  // define email
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    text: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `
      <div>
        <p>Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed.</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>

        <h3>Our Address</h3>
        <p>Subidbazar, Sylhet</p>
        <p>Bangladesh</p>
        <a href="https://crescentpartha.com/">unsubscribe</a>
      </div>
    `
  };

  // send email
  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    }
    else {
      console.log('Message send:', info);
    }
  });
}

// payment confirmation email outline created
function sendPaymentConfirmationEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  // define email
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `We have received your payment for ${treatment} is on ${date} at ${slot}`,
    text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `
      <div>
        <p>Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed. Thank you for your payment.</h3>
        <h3>We have received your payment.</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>
        <h3>Our Address</h3>
        <p>Subidbazar, Sylhet</p>
        <p>Bangladesh</p>
        <a href="https://crescentpartha.com/">unsubscribe</a>
      </div>
    `
  };

  // send email
  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    }
    else {
      console.log('Message send:', info);
    }
  });
}

async function run() {
  try {
    // await client.connect();
    client.connect();
    // console.log('doctor_portal database connected');
    const serviceCollection = client.db("doctors_portal").collection("services");
    const bookingCollection = client.db("doctors_portal").collection("bookings");
    const userCollection = client.db("doctors_portal").collection("users");
    const doctorCollection = client.db("doctors_portal").collection("doctors");
    const paymentCollection = client.db("doctors_portal").collection("payments");

    // 10. Verify user is admin or not? | verifyAdmin middleware implement
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'Forbidden' });
      }
    }

    // 14. payment intents API to get client Secret from stripe
    app.post('/create-payment-intent', verifyJWT, async(req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({clientSecret: paymentIntent.client_secret})
    });

    // 01. get all services
    app.get('/service', async (req, res) => {
      const query = {};
      // const cursor = serviceCollection.find(query);
      const cursor = serviceCollection.find(query).project({ name: 1 }); // project select the particular table attribute
      const services = await cursor.toArray();
      res.send(services);
    });

    // 03. get available slots | Find available time slots for a day 
    /* (Warning)
        - This is not the proper way to query
        - After learning more about mongodb. Use aggregate lookup, pipeline, match, group
    */
    app.get('/available', async (req, res) => {
      // const date = req.query.date || 'Jan 7, 2023';
      const date = req.query.date;

      /* step 1: get all services */
      const services = await serviceCollection.find().toArray();

      /* step 2: get the booking of that day | get all booked services - Output: [{}, {}, {}, {}] */
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      /* step 3: for each service */
      services.forEach(service => {
        /* step 4: Booked Service | Find bookings for that service - Output: [{}, {}, {}, {}] */
        const serviceBookings = bookings.filter(b => b.treatment === service.name);

        /* step 5: Booked Slots | Select slots for the service Bookings: ['', '', '', ''] */
        const booked = serviceBookings.map(s => s.slot);
        service.booked = booked;

        // service.booked = serviceBookings.map(s => s.slot);

        /* step 6: Available Slots | Select those slots that are not in booked Slots */
        // (Search Keyword: JavaScript algorithm to file elements from ane array that do not exist in another array)
        const available = service.slots.filter(s => !booked.includes(s));

        /* step 7: set available to slots to make it easier */
        // service.available = available;
        service.slots = available;
        // Output of each service: {_id, name, slots, booked, available}
      });

      res.send(services);
    })

    /* 
        *** API Naming Convention ***

        - app.get('/booking') // get all booking in this collection OR get more than one Or by filter/query
        - app.get('/booking/:id') // get a specific booking
        - app.post('/booking') // add a new booking
        - app.patch('/booking/:id') // specific one
        - app.put('/booking/:id') // upsert ==> update (if exists) or insert (if doesn't exist)
        - app.delete('/booking/:id') // specific one
    */

    // 04(i). get all user specific Appointments or booking data
    app.get('/booking', verifyJWT, async (req, res) => {
      // Send JWT token to back end for verification
      // const authorization = req.headers.authorization;
      // console.log('auth header', authorization);

      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'Forbidden Access' });
      }
    });

    // 13. get appointment by Id using get API
    app.get('/booking/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    // 02. post a single booked service
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
      const exists = await bookingCollection.findOne(query);
      // Limit one booking per user per treatment per day
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      // sendAppointmentEmail(booking.patient, booking.patientName, booking.date, booking.slot);
      console.log('sending email');
      sendAppointmentEmail(booking);
      return res.send({ success: true, result });
    });

    // 15. Store payment on database and update appointment data as well
    app.patch('/booking/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = {_id: ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: true, 
          transactionId: payment.transactionId,
        }
      }
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
      res.send(updatedDoc);
    });

    // 06. get all users
    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // 08. Admin level access | get particular user and return true/false based on role
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    });

    // 07. Create API to Make user an Admin
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      // const requester = req.decoded.email;
      // const requesterAccount = await userCollection.findOne({ email: requester });
      // if (requesterAccount.role === 'admin') {
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
      // }
      // else {
      //   res.status(403).send({ message: 'Forbidden' });
      // }
    });

    // 05. User Creation Process | put user to userCollection
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      // Issue simple JWT token
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result, token });
    });

    // 09. Save doctor info in the database using post API
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    // 11. get all doctors data using GET API
    app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });

    // 12. delete particular doctor with authorization using DELETE API
    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }; // find user
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });
  }
  finally {
    // await client.close(); // commented, if I want to keep connection active;
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Doctors Portal!');
});

app.listen(port, () => {
  console.log(`Doctor Portal app listening on port ${port}`);
});