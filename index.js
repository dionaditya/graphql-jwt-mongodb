const express = require("express");
const models = require("./models");
const bodyParser = require("body-parser");
const expressGraphql = require("express-graphql");
const mongoose = require("mongoose");
const cors = require("cors");
const { buildSchema } = require("graphql");
const bcrypt = require("bcrypt");
const JWT = require("jsonwebtoken");
const jwt = require('express-jwt')
const User = mongoose.model("user");

const ck = require('ckey');

// Construct a schema, using GraphQL schema language

const auth = jwt({
  secret: ck.JWT_KEY,
  credentialsRequired: true
})

const schema = buildSchema(`
  type User {
    id: ID,
    username: String,
    email: String,
    password: String
  }

  type Query {
    me: User
  }

  type Mutation {
    signUp (username: String!, email: String!, password: String!): String
    login (email: String!, password: String!): String
  }
`);

const app = express();

const MONGO_URL = ck.DB_URL 

mongoose.Promise = global.Promise;

mongoose.connect(MONGO_URL, {
  useUnifiedTopology: true,
  useNewUrlParser: true
});

mongoose.connection
  .once("open", () => console.log("connected to mongodb"))
  .on("error", error => console.log("Erorr connection"));


app.use(cors());
app.use(bodyParser.json());

const root =  {
  me: async (_, args, context) => {
    const result = await User.findById(args.user.id).exec()
    // user is authenticated
    return result
  },
  signUp: async ({ username, email, password }) => {
    const user = await new User({
      username,
      email,
      password: await bcrypt.hash(password, 10)
    }).save();

    return JWT.sign(
      { id: user.id, email: user.email },
      ck.JWT_KEY || "somscret",
      { expiresIn: "1y" }
    );

  },
  login: async ({email, password}) => {
    console.log(email)
    const user = await User.findOne({email: email }).exec()

    if(!user) {
      throw new Error('No user with this email');
    }

    const valid = await bcrypt.compare(password, user.password)
    
    if (!valid) {
      throw new Error('Incorrect password')
    }

    return JWT.sign(
      { id: user.id, email: user.email },
      ck.JWT_KEY,
      { expiresIn: '1d' }
    )
  }
};


app.use(
  "/graphql",
  auth,
  expressGraphql(req => {
    return {
      context: {
        user: req.user
      },
      schema: schema,
      rootValue: root,
      graphiql: true,
    }
  })
);

app.listen(4000, () => {
  console.log("listening to port 4000");
});
