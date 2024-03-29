require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const port = 5672;

const app = express();
app.use(cookieParser());
app.set("view engine", "ejs");
app.use(express.static('public'));

const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})

const pool = mysql.createPool({
    host: process.env.MYSQL_HOSTNAME,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,  
});

const sessionMiddleware = session({
    secret: 'SessionSecretKey',
    resave: false,
    saveUninitialized: true,
});
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.static('static'));
app.use(bodyParser.urlencoded({ extended: true }));
const isAuthenticated = (req, res, next) => {
    if (req.cookies.isAuthenticated) {
        next();
    }
    else {
        res.redirect('/');
    }
};


// Login Page
app.get('/', async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Level => 0 = admin / 1 = SDM / 2 = supplier
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tb_user_e_supp (id INT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(255) NOT NULL, password VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, 
            status INT DEFAULT 1, level INT DEFAULT 1)
        `);
        // await connection.query('DROP TABLE tb_user_e_supp');
        // await connection.query(`INSERT INTO tb_user_e_supp (username, password, email, level)
        // VALUES ('admin', 'admin', 'uthai.khantamongkhon.a7p@ap.denso.com', 0)`);
        connection.release();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tb_master_packing (id INT,
            qr_packingList VARCHAR(255), partNumber VARCHAR(255), partName VARCHAR(1080), 
            qr_box VARCHAR(255) PRIMARY KEY, qty INT, boxCount INT, is_fac1_receive BIT(1), suppStartDate DATE, suppStartTime TIME, suppEndDate DATE, suppEndTime TIME, 
            suppLeader VARCHAR(255))
        `);
        connection.release();
        // await connection.query(`ALTER TABLE tb_master_packing MODIFY id INT NOT NULL AUTO_INCREMENT, DROP PRIMARY KEY, ADD PRIMARY KEY (qr_box)`);
        // connection.release();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tb_actual_packing (id INT PRIMARY KEY AUTO_INCREMENT,
            qr_packingList VARCHAR(255), partNumber VARCHAR(255), partName VARCHAR(1080), 
            qr_box VARCHAR(255), qty INT, boxCount INT)
        `);
        connection.release();
        // await connection.query('ALTER TABLE tb_master_packing ADD COLUMN fac1_receive BOOLEAN DEFAULT FALSE');
        // connection.release();
        // await connection.query(`
        //     INSERT INTO tb_master_packing (qr_packingList, partNumber, partName, qr_box, qty, boxCount)
        //     VALUES ('A54321', 'SM299159-0080', 'CYLINDER SUPPLY PUMP(HP5S)', 'A4321', 1000, 1);
        // `);
        // connection.release();
        // await connection.query(`DROP TABLE tb_master_packing`);
        // connection.release();
        // await connection.query(`
        //     INSERT INTO tb_master_packing (qr_packingList) VALUES ('A54321')
        // `);
        // connection.release();
        
        // For debug user
        const [user_datas] = await connection.query('SELECT * FROM tb_user_e_supp');
        connection.release();
        user_datas.forEach((user_data) => {
            console.log(user_data.username + " " + user_data.password + " " + user_data.email);
        });

        res.render('login');
    }
    catch (error) {
        console.error("Error : ", error);
        res.status(500);
        res.render(error);
    }
});
// Login end point
app.post('/login', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const {username, password} = req.body;
        // Check login
        const [user] = await connection.query(`SELECT * FROM tb_user_e_supp WHERE username = ?
            AND password = ?`, [username, password]);
        connection.release();

        const [user_datas] = await connection.query('SELECT username, email, level FROM tb_user_e_supp');
        connection.release();

        if (user.length > 0) {
            req.session.isAuthenticated = true;
            res.cookie('isAuthenticated', true);
            console.log("User level : ", user[0].level);
            if (user[0].level === 0) {
                console.log('Welcome admin');
                res.redirect('/admin_page');
            }
            else {
                console.log('Welcome user');
            }
        }
    }
    catch (error) {
        console.error("Error : ", error);
        res.status(500);
        res.send("Error");
    }
});

// Admin page
app.get('/admin_page', isAuthenticated, async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [user_datas] = await connection.query('SELECT id, username, email, level FROM tb_user_e_supp');
        connection.release();

        res.render('admin_page', {user_datas: user_datas});
    }
    catch (error) {
        console.error("Error : ", error);
        res.status(500);
        res.send("Error");
    }
});

// Master setting shoow main QR
app.get('/admin_page/master_main', isAuthenticated, async (req, res) => {
    try{
        const connection = await pool.getConnection();
        const [qr_packingList] = await connection.execute(`
            SELECT DISTINCT qr_packingList FROM tb_master_packing    
        `);
        console.log('QR packing list : ', qr_packingList);

        res.render('master_main', {qr_packingList: qr_packingList});
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
})

// Master setting page
app.get('/admin_page/master_setting', isAuthenticated, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [master_datas] = await connection.execute(`
            SELECT qr_packingList, partNumber, partName, qr_box, qty, boxCount, is_fac1_receive
            FROM tb_master_packing
        `);
        connection.release();

        const is_fac1_receive = master_datas.map(data => data.is_fac1_receive.toString('hex'));
        console.log('Master datas : ', master_datas);
        console.log("Is Fac1 Receive : ", is_fac1_receive);
        res.render('master_setting', {master_datas: master_datas, is_fac1_receive: is_fac1_receive});

    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
});
app.post('/admin_page/master_setting/adding', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const { qr_packingList, part_number, part_name, box_no, qty, count_box, is_fac1_receive } = req.body;
        const is_fac1_receive_bit = is_fac1_receive === 'on' ? 1 : 0;
        console.log("Fac1 receive: ", is_fac1_receive_bit);

        // Check if the qr_box value already exists in the table
        const [existingRow] = await connection.execute('SELECT qr_box FROM tb_master_packing WHERE qr_box = ?', [box_no]);
        if (existingRow.length > 0) {
            // Handle the case where the qr_box value already exists
            console.log('Duplicate entry for qr_box:', box_no);
            connection.release();
            res.redirect('/admin_page/master_setting');
            return;
        }

        // Insert the new row into the table
        await connection.execute(`
            INSERT INTO tb_master_packing (qr_packingList, partNumber, partName, qr_box, qty, boxCount, is_fac1_receive)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [qr_packingList, part_number, part_name, box_no, qty, count_box, is_fac1_receive_bit]);

        connection.release();

        res.redirect('/admin_page/master_setting');
    } catch (error) {
        console.error('Error: ', error);
        res.redirect('/admin_page/master_setting');
    }
});

// Fac1 receive scan page
app.get('/admin_page/receive_scan_master', isAuthenticated, (req, res) => {
    try {
        res.render('receive_scan_master');
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
});
// Fac1 receive scan endpoint
app.post('/admin_page/receive_scan_master/master_receiving', (req, res) => {
    try {
        const {qr_packingList} = req.body;

        res.redirect(`/admin_page/receive_scan_box?qr_packingList=${qr_packingList}`)
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
})
// Fac1 receive scan box page
app.get('/admin_page/receive_scan_box', isAuthenticated, async (req, res) => {
    try {
        const qr_packingList = req.query.qr_packingList;

        const connection = await pool.getConnection();
        const [master_datas] = await connection.query(`
            SELECT qr_packingList, partNumber, partName, qr_box, qty, boxCount, is_fac1_receive
            FROM tb_master_packing WHERE qr_packingList = ?
        `, [qr_packingList]);
        connection.release();

        res.render('receive_scan_sub', {master_datas: master_datas, qr_packingList: qr_packingList});
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
});
// Fac1 receive scan box endpoint
app.post('/admin_page/receive_scan_master/receive_box_complete', async (req, res) => {
    try {
        const {qr_packingList, qr_box} = req.body;
        // const qr_packingList_link = req.query.qr_packingList;
        console.log(qr_packingList + " " + qr_box);

        const connection = await pool.getConnection();
        await connection.execute(`
            UPDATE tb_master_packing SET is_fac1_receive = 1 WHERE qr_box = ? AND qr_packingList = ?
        `, [qr_box, qr_packingList]);
        connection.release();

        res.redirect(`/admin_page/receive_scan_box?qr_packingList=${qr_packingList}`);
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
})

// Master setting edit page
app.get('/admin_page/master_setting/edit', isAuthenticated, async (req, res) => {
    try {
        const {qr_box, qr_packingList} = req.query;

        const connection = await pool.getConnection();
        const [master_datas] = await connection.query(`
            SELECT qr_packingList, partNumber, partName, qr_box, qty, boxCount, is_fac1_receive
            FROM tb_master_packing WHERE qr_packingList = ? AND qr_box = ?
        `, [qr_packingList, qr_box]);
        connection.release();

        res.render('master_edit', {master_datas: master_datas});
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
});
app.post('/admin_page/master_setting/editing', async (req, res) => {
    try {
        const {qr_packingList, partNumber, partName, qr_box, qty, is_fac1_receive} = req.body;
        let is_fac1_receive_bit = 0;
        if (is_fac1_receive === '00') {
            is_fac1_receive_bit = 0;
        }
        else if (is_fac1_receive === '01') {
            is_fac1_receive_bit = 1;
        }
        console.log(qr_packingList, partNumber, partName, qr_box, qty, is_fac1_receive, is_fac1_receive_bit);

        const connection = await pool.getConnection();
        await connection.execute(`
            UPDATE tb_master_packing SET qr_packingList = ?, partNumber = ?,
            partName = ?, qty = ?, is_fac1_receive = ? WHERE qr_box = ?
        `, [qr_packingList, partNumber, partName, qty, is_fac1_receive_bit, qr_box]);
        connection.release();

        res.redirect('/admin_page/master_setting');
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
})
// Master setting delete end point 
app.get('/admin_page/master_setting/delete', async (req, res) => {
    try {
        const {qr_box, qr_packingList} = req.query;

        const connection = await pool.getConnection();
        await connection.execute('DELETE FROM tb_master_packing WHERE qr_box = ? AND qr_packingList = ?', [qr_box, qr_packingList]);
        connection.release();

        res.redirect('/admin_page/master_setting');
    }
    catch (error) {
        console.error('Error : ', error);
        res.status(500);
    }
});

// Edit page
app.get('/admin_page/edit', isAuthenticated, (req, res) => {
    try {
        const userId = req.query.id;
        const username = req.query.name;
        const email = req.query.email;
        console.log(username + " " + email);

        res.render('edit_user', { userId: userId, username: username, email: email });
    }
    catch (error) {
        console.error("Error : ", error);
    }
});
// Edit end point
app.post('/admin_page/editing', async (req, res) => {
    try {
        // const {username, password, email} 
        const connection = await pool.getConnection();

        const [user_datas] = await connection.query('SELECT id, username, email, level FROM tb_user_e_supp');
        connection.release();
    }
    catch (error) {

    }
})

// Register Page
app.get('/register', (req, res) => {
    res.render('register');
})
// Registing end point
app.post('/registing', async (req, res) => {
    const {username, password, email} = req.body;

    try {
        const connection = await pool.getConnection();
        await connection.execute(`
            INSERT INTO tb_user_e_supp (username, password, email) VALUES(?, ?, ?)
        `, [username, password, email]);

        connection.release();
        
        res.redirect('/');
    }
    catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('isAuthenticated'); // Clear the isAuthenticated cookie

    
    res.redirect('/');
});