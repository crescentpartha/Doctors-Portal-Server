const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// connection setup with database with secure password on environment variable
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nywkbwu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
  try {
    await client.connect();
    // console.log('doctor_portal database connected');
    const serviceCollection = client.db("doctors_portal").collection("services");
    const bookingCollection = client.db("doctors_portal").collection("bookings");
    const userCollection = client.db("doctors_portal").collection("users");

    // 01. get all services
    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
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

    // 04. get all user specific Appointments or booking data
    app.get('/booking', async (req, res) => {
      const patient = req.query.patient;
      const query = { patient: patient };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    // 02. get all booked services
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
      const exists = await bookingCollection.findOne(query);
      // Limit one booking per user per treatment per day
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    // 05. User Creation Process | put user to userCollection
    app.put('/user/:email', async(req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
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