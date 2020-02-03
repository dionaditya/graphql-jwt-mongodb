const express = require("express");
const models = require("./server/models");
const bodyParser = require("body-parser");
const expressGraphql = require("express-graphql");
const mongoose = require("mongoose");
const cors = require("cors");
const { buildSchema } = require("graphql");
const bcrypt = require("bcrypt");
const JWT = require("jsonwebtoken");
const jwt = require("express-jwt");
const User = mongoose.model("user");
const Product = mongoose.model("product");
const redisClient = require("redis").createClient;
const redisReady=  redisClient(6379, "localhost");

const ck = require("ckey");

// Construct a schema, using GraphQL schema language

const auth = jwt({
  secret: ck.JWT_KEY,
  credentialsRequired: false
});

const schema = buildSchema(`
  type User {
    id: ID,
    username: String,
    email: String,
    password: String
  }

  type Product {
    id: ID,
    title: String,
    category: String
  }

  type Query {
    user: User,
    products: [Product]
    product(id: String!): Product
  }

  type Mutation {
    signUp (username: String!, email: String!, password: String!): String
    login (email: String!, password: String!): String
  }
`);

const app = express();

const MONGO_URL = ck.DB_URL;

mongoose.Promise = global.Promise;

mongoose.connect(MONGO_URL, {
  useUnifiedTopology: true,
  useNewUrlParser: true
});

mongoose.connection
  .once("open", () => console.log("connected to mongodb"))
  .on("error", error => console.log("Erorr connection"));

redisReady.on("connect", () => {
  console.log("connected to Redis");
});

app.use(cors());
app.use(bodyParser.json());

const root = {
  user: async (_, args, context) => {
    const result = await User.findById(args.user.id).exec();
    // user is authenticated
    return result;
  },
  products: async (_, args, content) => {
    return new Promise((resolve, reject) => {
      resolve(Product
            .find()
            .exec())
    });
  },
  product: async ({id}, args) => {
    const getProduct = new Promise((resolve, reject) => {
      args.redisReady.get(id, async (err, reply) => {
        if(err) {
          throw new Error ('error')
        } else if(reply) {
          const parseReply = JSON.parse(reply)
          const replyProduct = {
            id: parseReply._id,
            title: parseReply.title,
            category: parseReply.category
          }
          return resolve(replyProduct)
        } else {
          return Product
            .findOne({_id: id})
            .exec()
            .then((product) => {
              console.log('product', product)
              args.redisReady.set(id, JSON.stringify(product))
              resolve(product)
            })
        }
      })
    });
    return await getProduct
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
  login: async ({ email, password }) => {
    console.log(email);
    const user = await User.findOne({ email: email }).exec();

    if (!user) {
      throw new Error("No user with this email");
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new Error("Incorrect password");
    }

    return JWT.sign({ id: user.id, email: user.email }, ck.JWT_KEY, {
      expiresIn: "1d"
    });
  }
};

app.use(
  "/graphql",
  auth,
  expressGraphql(req => {
    return {
      context: {
        user: req.user,
        redisReady
      },
      schema: schema,
      rootValue: root,
      graphiql: true
    };
  })
);

app.listen(4000, () => {
  console.log("listening to port 4000");
});
