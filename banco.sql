
use alunos_gustavopereira

CREATE TABLE IF NOT EXISTS track_produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    imagem VARCHAR(500),
    estoque INT NOT NULL DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS track_usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS track_pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'pendente',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_usuario)
        REFERENCES track_usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS track_itens_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_produto INT NOT NULL,
    quantidade INT NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,

    FOREIGN KEY (id_pedido)
        REFERENCES track_pedidos(id),

    FOREIGN KEY (id_produto)
        REFERENCES track_produtos(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS track_carrinho (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_produto INT NOT NULL,
    quantidade INT NOT NULL DEFAULT 1,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (id_usuario, id_produto),

    FOREIGN KEY (id_usuario)
        REFERENCES track_usuarios(id),

    FOREIGN KEY (id_produto)
        REFERENCES track_produtos(id)
) ENGINE=InnoDB;


INSERT INTO track_produtos (nome, descricao, preco, estoque)
VALUES
('Track Runner', 'Tênis esportivo para o dia a dia', 199.90, 10),
('Track Street', 'Tênis casual de estilo urbano', 249.90, 8),
('Track Classic', 'Tênis clássico para uso diário', 179.90, 12);

SELECT * FROM track_produtos;

