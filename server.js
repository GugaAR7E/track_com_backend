
require('dotenv').config();
const bcrypt = require('bcrypt');
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


/* CADASTRO DE CLIENTE */
app.post('/api/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body || {};

        if (!nome?.trim() || !email?.trim() || !senha) {
            return res.status(400).json({
                erro: 'Preencha todos os campos.'
            });
        }

        if (senha.length < 6) {
            return res.status(400).json({
                erro: 'A senha deve ter pelo menos 6 caracteres.'
            });
        }

        const emailNormalizado = email.trim().toLowerCase();
        const senhaHash = await bcrypt.hash(senha, 12);

        await db.execute(
            `INSERT INTO track_usuarios (nome, email, senha)
             VALUES (?, ?, ?)`,
            [nome.trim(), emailNormalizado, senhaHash]
        );

        return res.status(201).json({
            mensagem: 'Cadastro realizado com sucesso!'
        });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                erro: 'Este e-mail já está cadastrado.'
            });
        }

        console.error('Erro no cadastro:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível realizar o cadastro.'
        });
    }
});


/* LOGIN DO CLIENTE */
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body || {};

        if (!email?.trim() || !senha) {
            return res.status(400).json({
                erro: 'Informe seu e-mail e sua senha.'
            });
        }

        const [usuarios] = await db.execute(
            `SELECT id, nome, email, senha
             FROM track_usuarios
             WHERE email = ?
             LIMIT 1`,
            [email.trim().toLowerCase()]
        );

        if (
            usuarios.length === 0 ||
            !(await bcrypt.compare(senha, usuarios[0].senha))
        ) {
            return res.status(401).json({
                erro: 'E-mail ou senha incorretos.'
            });
        }

        const usuario = usuarios[0];

        req.session.regenerate((erro) => {
            if (erro) {
                return res.status(500).json({
                    erro: 'Não foi possível iniciar a sessão.'
                });
            }

            req.session.usuario = {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email
            };

            req.session.save((erroAoSalvar) => {
                if (erroAoSalvar) {
                    return res.status(500).json({
                        erro: 'Não foi possível salvar a sessão.'
                    });
                }

                return res.json({
                    mensagem: 'Login realizado com sucesso!',
                    usuario: req.session.usuario
                });
            });
        });
    } catch (erro) {
        console.error('Erro no login:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível realizar o login.'
        });
    }
});


/* VERIFICAR SESSÃO DO CLIENTE */
app.get('/api/sessao', (req, res) => {
    res.json({
        usuario: req.session?.usuario || null
    });
});


/* SAIR DA CONTA */
app.post('/api/logout', (req, res) => {
    req.session.destroy((erro) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Não foi possível sair da conta.'
            });
        }

        res.clearCookie('connect.sid');

        return res.json({
            mensagem: 'Você saiu da sua conta.'
        });
    });
});


app.listen(PORT, () => {
    console.log(`Track disponível em http://localhost:${PORT}`);
});

