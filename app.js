const express = require("express");
const app = express();
const router = express.Router();
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); //Appending extension
  },
});

const upload = multer({ storage: storage });

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
});

app.use("/uploads", express.static("uploads"));
app.use(express.json());
app.use(cors());

app.post("/register", async (req, res) => {
  const { usuario, senha } = req.body;

  try {
    const result = db.query("SELECT * FROM register WHERE usuario = ?", [
      usuario,
    ]);
    const existingUser = result[0] ?? null;

    if (existingUser) {
      res.status(400).send({ msg: "Usuario ja cadastrado" });
      return;
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    db.query("INSERT INTO register (usuario, senha) VALUES (?, ?)", [
      usuario,
      hashedPassword,
    ]);

    res.status(201).send({ msg: "Usuario cadastrado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ msg: "Erro ao processar a solicitação" });
  }
});

app.post("/login", (req, res) => {
  const usuario = req.body.usuario;
  const senha = req.body.senha;

  db.query(
    "SELECT * FROM register WHERE usuario = ?",
    [usuario],
    (err, result) => {
      if (err) {
        res.send(err);
      } else {
        if (result.length > 0) {
          bcrypt.compare(senha, result[0].senha, (error, response) => {
            if (error) {
              res.send(error);
            } else {
              if (response) {
                // Gerando o token JWT
                const token = jwt.sign({ usuario: usuario }, "secretkey", {
                  expiresIn: "1h",
                });
                res.json({ token });
              } else {
                res.send({ msg: "Senha incorreta" });
              }
            }
          });
        } else {
          res.send({ msg: "Usuário não registrado!" });
        }
      }
    }
  );
});

app.post("/blog", upload.single("photo"), async (req, res) => {
  const { news, friendly_url, news_title } = req.body;
  if (!req.file) {
    throw Error("arquivo nao encontrado");
  }
  const photo = req.file.filename; // File name of the uploaded photo

  // Get current date
  const post_day = new Date().toISOString().slice(0, 10);
  console.log({ news, friendly_url, news_title, photo, post_day });

  try {
    const result = db.query(
      "INSERT INTO blog (photo, news, friendly_url, news_title, post_day, uuid) VALUES (?, ?, ?, ?, ?, UUID())",
      [photo, news, friendly_url, news_title, post_day]
    );

    res.status(201).send({ msg: "Blog post added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ msg: "Error processing request" });
  }
});

app.get("/blog", async (req, res) => {
  const secret = req.headers.secret;
  if (secret != "abacaxi") {
    res.status(403).send({ msg: "Usuário não autorizado" });
    return;
  }
  try {
    db.query("SELECT * FROM blog", (err, results) => {
      if (err) {
        return;
      }

      const link = "localhost:3002";

      // Modify the response to include the file path to the uploaded image
      const blogPosts = results.map((post) => ({
        uuid: post.uuid,
        photo: `http://${link}/uploads/${post.photo}`, // Add the file path to the photo
        news: post.news,
        friendly_url: post.friendly_url,
        news_title: post.news_title,
        post_day: new Date(post.post_day).toLocaleDateString("pt-BR", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
      }));

      res.status(200).send(blogPosts);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ msg: "Error processing request" });
  }
});

app.get("/blog/:friendly_url", async (req, res) => {
  try {
    const friendly_url = req.params.friendly_url;
    db.query(
      "SELECT * FROM blog WHERE friendly_url=?",
      [friendly_url],
      (err, results) => {
        if (err) {
          console.error(err);
          res.status(500).send({ msg: "Error processing request" });
          return;
        }
        if (results.length === 0) {
          res.status(404).send({ msg: "Blog post not found" });
          return;
        }
        const blogPost = results[0];
        res.status(200).send(blogPost);
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send({ msg: "Error processing request" });
  }
});

/* app.get("/blog/:d", async (req, res) => {
  try {
    const friendly_url = req.params.friendly_url;
    db.query(
      "SELECT * FROM blog WHERE friendly_url=?",
      [friendly_url],
      (err, results) => {
        if (err) {
          console.error(err);
          res.status(500).send({ msg: "Error processing request" });
          return;
        }
        if (results.length === 0) {
          res.status(404).send({ msg: "Blog post not found" });
          return;
        }
        const blogPost = results[0];
        res.status(200).send(blogPost);
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send({ msg: "Error processing request" });
  }
}); */

app.put("/blog/:friendly_url", upload.single("photo"), async (req, res) => {
  const { news, news_title } = req.body;
  const friendly_url = req.params.friendly_url;

  // Check if photo was uploaded
  let photo;
  if (req.file) {
    photo = req.file.filename;
  }

  // Update fields that are not null
  const fieldsToUpdate = {};
  if (news) fieldsToUpdate.news = news;
  if (friendly_url) fieldsToUpdate.friendly_url = friendly_url;
  if (news_title) fieldsToUpdate.news_title = news_title;
  if (photo) fieldsToUpdate.photo = photo;

  try {
    const query = "UPDATE blog SET ? WHERE friendly_url = ?";
    db.query(query, [fieldsToUpdate, friendly_url], (error, results) => {
      if (error) {
        console.error(error);
        res.status(500).send({ msg: "Error processing request" });
        return;
      }
      res.status(200).send({ msg: "Blog post updated successfully" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ msg: "Error processing request" });
  }
});

server.listen({ host: "0.0.0.0", port: 10000 });
