
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');

const pastaUploads = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(pastaUploads)) {
    fs.mkdirSync(pastaUploads, { recursive: true });
}

const armazenamento = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, pastaUploads);
    },

    filename: (req, file, callback) => {
        const extensoesPermitidas = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp'
        };

        const extensao = extensoesPermitidas[file.mimetype];

        if (!extensao) {
            return callback(new Error('Formato inválido. Use JPG, PNG ou WEBP.'));
        }

        const nomeArquivo = `${Date.now()}-${require('crypto').randomUUID()}${extensao}`;

        callback(null, nomeArquivo);
    }
});

const upload = multer({
    storage: armazenamento,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];

        if (permitidos.includes(file.mimetype)) {
            callback(null, true);
        } else {
            callback(new Error('Envie uma imagem JPG, PNG ou WEBP.'));
        }
    }
});

const app = express();
const PORT = 3000;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 2 * 60 * 60 * 1000
    }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/produtos', async (req, res) => {
    try {
        const [produtos] = await db.query(
            'SELECT id, nome, descricao, preco, imagem, estoque FROM track_produtos'
        );

        res.json(produtos);
    } catch (erro) {
        console.error('Erro ao buscar produtos:', erro.message);
        res.status(500).json({
            erro: 'Não foi possível carregar os produtos.'
        });
    }
});

function exigirAdmin(req, res, next) {
    if (req.session && req.session.admin === true) {
        return next();
    }

    return res.status(401).json({
        erro: 'Faça login como administrador.'
    });
}


app.get('/api/admin/produtos', exigirAdmin, async (req, res) => {
    try {
        const [produtos] = await db.query(
            `SELECT id, nome, descricao, preco, imagem, estoque
             FROM track_produtos
             ORDER BY id DESC`
        );

        res.json(produtos);
    } catch (erro) {
        console.error('Erro ao listar produtos:', erro.message);
        res.status(500).json({
            erro: 'Não foi possível carregar os produtos.'
        });
    }
});


app.delete('/api/admin/produtos/:id', exigirAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                erro: 'ID de produto inválido.'
            });
        }

        const [produtos] = await db.execute(
            'SELECT imagem FROM track_produtos WHERE id = ?',
            [id]
        );

        if (produtos.length === 0) {
            return res.status(404).json({
                erro: 'Tênis não encontrado.'
            });
        }

        await db.execute(
            'DELETE FROM track_produtos WHERE id = ?',
            [id]
        );

        const imagem = produtos[0].imagem;

        if (imagem?.startsWith('/uploads/')) {
            const caminho = path.join(
                pastaUploads,
                path.basename(imagem)
            );

            if (fs.existsSync(caminho)) {
                fs.unlinkSync(caminho);
            }
        }

        res.json({ mensagem: 'Tênis excluído com sucesso!' });
    } catch (erro) {
        console.error('Erro ao excluir produto:', erro.message);

        if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                erro: 'Este tênis está associado a um pedido e não pode ser excluído.'
            });
        }

        res.status(500).json({
            erro: 'Não foi possível excluir o tênis.'
        });
    }
});


app.post('/api/admin/produtos', exigirAdmin, upload.single('imagem'), async (req, res) => {
    try {
        const { nome, descricao, preco, estoque } = req.body;

        if (!nome || preco === undefined || estoque === undefined || !req.file) {
            return res.status(400).json({
                erro: 'Preencha os campos e selecione uma foto.'
            });
        }

        const valor = Number(preco);
        const quantidade = Number(estoque);

        if (
            !Number.isFinite(valor) || valor <= 0 ||
            !Number.isInteger(quantidade) || quantidade < 0
        ) {
            return res.status(400).json({
                erro: 'Informe um preço válido e um estoque inteiro não negativo.'
            });
        }

        const caminhoImagem = `/uploads/${req.file.filename}`;

        await db.execute(
            `INSERT INTO track_produtos
            (nome, descricao, preco, imagem, estoque)
            VALUES (?, ?, ?, ?, ?)`,
            [nome.trim(), descricao || '', valor, caminhoImagem, quantidade]
        );

        res.status(201).json({
            mensagem: 'Tênis cadastrado com sucesso!'
        });
    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível cadastrar o tênis.'
        });
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (
        usuario !== process.env.ADMIN_USER ||
        senha !== process.env.ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            erro: 'Usuário ou senha incorretos.'
        });
    }

    req.session.regenerate((erro) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Não foi possível iniciar a sessão.'
            });
        }

        req.session.admin = true;

        res.json({
            mensagem: 'Login realizado com sucesso!'
        });
    });
});

app.get('/api/admin/sessao', (req, res) => {
    res.json({
        autenticado: req.session?.admin === true
    });
});

app.listen(PORT, () => {
    console.log(`Track disponível em http://localhost:${PORT}`);
});

