import express from "express";
import pool from "./db";

const app = express();
app.use(express.json());

pool
  .query("SELECT NOW()")
  .then(() => console.log("PostgreSQL connecté"))
  .catch((err) => {
    console.error("Erreur de connexion PostgreSQL:", err.message);
    process.exit(1);
  });

app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ message: "Le paramètre q est requis" });
    }

    const [artists, albums, tracks] = await Promise.all([
      pool.query("SELECT * FROM artists WHERE name ILIKE '%' || $1 || '%'", [
        q,
      ]),
      pool.query(
        "SELECT albums.*, artists.name AS artist FROM albums INNER JOIN artists ON albums.artist_id = artists.id WHERE title ILIKE '%' || $1 || '%'",
        [q],
      ),
      pool.query(
        "SELECT tracks.*, albums.title AS album, artists.name AS artist FROM tracks INNER JOIN albums ON tracks.album_id = albums.id INNER JOIN artists ON albums.artist_id = artists.id WHERE title ILIKE '%' || $1 || '%'",
        [q],
      ),
    ]);

    const response = {
      artists: artists.rows,
      albums: albums.rows,
      tracks: tracks.rows,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

// ==================================================
// =================== ARTISTS ======================
// ==================================================

// app.get("/api/artists", async (req, res) => {
//   try {
//     const result = await pool.query(
//       "SELECT * FROM artists ORDER BY name"
//     );
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ message: (err as Error).message });
//   }
// });

app.get("/api/artists", async (req, res) => {
  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (req.query.genre) {
      conditions.push(`genre = ${params.length + 1}`);
      params.push(req.query.genre);
    }
    if (req.query.country) {
      conditions.push(`country = ${params.length + 1}`);
      params.push(req.query.country);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT * FROM artists ${where} ORDER BY name`;
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/artists/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM artists WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artiste non trouvé" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/artists/:id/stats", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        artists.name,
        artists.genre,
        COUNT(DISTINCT albums.id)::int AS album_count,
        COUNT(tracks.id)::int AS track_count,
        COALESCE(SUM(tracks.duration), 0)::int AS total_duration,
        ROUND(COALESCE(AVG(tracks.duration), 0), 1)::float AS average_track_duration
       FROM artists
       LEFT JOIN albums ON albums.artist_id = artists.id
       LEFT JOIN tracks ON tracks.album_id = albums.id
       WHERE artists.id = $1
       GROUP BY artists.id`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artiste non trouvé" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/artists", async (req, res) => {
  const { name, genre, country, formed_year } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO artists (name, genre, country, formed_year) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, genre, country, formed_year],
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Name déjà pris" });
    }
    if (error.code === "23514") {
      return res.status(400).json({ message: "Données invalides" });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put("/api/artists/:id", async (req, res) => {
  const { name, genre, country, formed_year } = req.body;
  try {
    const result = await pool.query(
      "UPDATE artists SET name = $1, genre = $2, country = $3, formed_year = $4 WHERE id = $5 RETURNING *",
      [name, genre, country, formed_year, req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artiste non trouvé" });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Name déjà pris" });
    }
    if (error.code === "23514") {
      return res.status(400).json({ message: "Données invalides" });
    }

    res.status(500).json({ message: error.message });
  }
});

app.delete("/api/artists/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM artists WHERE id = $1 RETURNING *",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Artiste non trouvé" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

// ==================================================
// =================== ALBUMS ======================
// ==================================================

app.get("/api/albums", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
      albums.*, artists.name AS arist,
      COUNT(tracks.id)::int AS track_count,
      COALESCE(SUM(tracks.duration), 0)::int AS total_duration
      FROM albums
      INNER JOIN artists ON albums.artist_id = artists.id
      LEFT JOIN tracks ON tracks.album_id = albums.id
      GROUP BY albums.id, artists.name
      ORDER BY albums.release_year DESC`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/artists/:id/albums", async (req, res) => {
  try {
    const artist = await pool.query("SELECT * FROM artists WHERE id = $1", [
      req.params.id,
    ]);
    if (artist.rows.length === 0) {
      return res.status(404).json({ message: "Artiste non trouvé" });
    }

    const result = await pool.query(
      "SELECT allbums.*, artists.name AS artist FROM albums INNER JOIN artists ON albums.artist_id = artists.id WHERE albums.artist_id = $1 ORDER BY albums.release_year DESC",
      [req.params.id],
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/albums", async (req, res) => {
  const { title, release_year, artist_id } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO albums (title, release_year, artist_id ) VALUES ($1, $2, $3) RETURNING *",
      [title, release_year, artist_id],
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23514") {
      return res.status(400).json({ message: "Données invalides" });
    }
    if (error.code === "23503") {
      return res.status(400).json({ message: "Artiste non trouvé" });
    }
    res.status(500).json({ message: (error as Error).message });
  }
});

app.delete("/api/albums/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM albums WHERE id = $1 RETURNING *",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Album non trouvé" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

// ==================================================
// =================== TRACKS ======================
// ==================================================

app.get("/api/albums/:id/tracks", async (req, res) => {
  try {
    const album = await pool.query("SELECT * FROM albums WHERE id = $1", [
      req.params.id,
    ]);
    if (album.rows.length === 0) {
      return res.status(404).json({ message: "Album non trouvé" });
    }

    const result = await pool.query(
      "SELECT * FROM tracks WHERE tracks.album_id = $1 ORDER BY track_number ASC",
      [req.params.id],
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/tracks", async (req, res) => {
  const { title, duration, track_number, album_id } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO tracks (title, duration, track_number, album_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, duration, track_number, album_id],
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23514") {
      return res.status(400).json({ message: "Données invalides" });
    }
    if (error.code === "23503") {
      return res.status(400).json({ message: "Album non trouvé" });
    }
    res.status(500).json({ message: (error as Error).message });
  }
});

app.delete("/api/tracks/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM tracks WHERE id = $1 RETURNING *",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Track non trouvé" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Le serveur tourne sur le port", PORT);
});
