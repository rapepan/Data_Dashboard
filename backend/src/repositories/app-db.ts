import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
let pool: Pool | null = null;

export const appDb = {
  isConfigured() {
    return Boolean(process.env.DASHBOARD_DB_HOST && process.env.DASHBOARD_DB_DATABASE);
  },

  t(name: 'feedback' | 'feedback_history' | 'audit_log' | 'audit_log_archive' | 'user_settings' | 'login_failures' | 'users_seen') {
    return `\`${process.env.DASHBOARD_DB_TABLE_PREFIX ?? ''}${name}\``;
  },

  target() {
    return `${process.env.DASHBOARD_DB_HOST}/${process.env.DASHBOARD_DB_DATABASE}`;
  },

  pool(): Pool {
    if (!pool) {
      pool = mysql.createPool({
        host: process.env.DASHBOARD_DB_HOST,
        port: Number(process.env.DASHBOARD_DB_PORT || 3306),
        user: process.env.DASHBOARD_DB_USER,
        password: process.env.DASHBOARD_DB_PASSWORD,
        database: process.env.DASHBOARD_DB_DATABASE,
        charset: 'utf8mb4',
        timezone: 'Z',
        connectionLimit: 5,
        connectTimeout: 5000,
      });

      (pool as unknown as { pool: { on(event: 'connection', cb: (conn: { query(sql: string): void }) => void): void } })
        .pool.on('connection', conn => conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci'));
    }
    return pool;
  },

  async rows<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool().query<T[]>(sql, params);
    return rows;
  },

  async exec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
    const [result] = await this.pool().query<ResultSetHeader>(sql, params);
    return result;
  },

  async transaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool().getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      throw error;
    } finally {
      conn.release();
    }
  },

  async ping() {
    await this.pool().query('SELECT 1');
  },

  async ensureSchema() {
    const t = this.t.bind(this);
    const options = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';
    await this.exec(`CREATE TABLE IF NOT EXISTS ${t('feedback')} (
      id CHAR(8) NOT NULL PRIMARY KEY COMMENT 'รหัสเรื่อง',
      created_at DATETIME(3) NOT NULL COMMENT 'เวลาแจ้ง (UTC)',
      status VARCHAR(16) NOT NULL COMMENT 'new / in_progress / done',
      category VARCHAR(16) NOT NULL COMMENT 'bug / data / suggestion / other',
      page VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      name VARCHAR(200) NULL COMMENT 'ชื่อผู้แจ้ง',
      position VARCHAR(200) NULL COMMENT 'หน่วยงาน / ตำแหน่ง',
      loginname VARCHAR(64) NULL,
      ip VARCHAR(45) NULL,
      contact VARCHAR(300) NULL COMMENT 'ช่องทางติดต่อแบบข้อความรวม (เรื่องเก่า)',
      contact_phone VARCHAR(20) NULL,
      contact_line VARCHAR(60) NULL,
      line_qr VARCHAR(300) NULL COMMENT 'ไฟล์รูป QR LINE (JSON) — ตัวรูปอยู่ใน backend/data/feedback-uploads',
      images TEXT NULL COMMENT 'ไฟล์รูปแนบ (JSON) — ตัวรูปอยู่ใน backend/data/feedback-uploads',
      images_purged TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ลบรูปตามกำหนดเก็บ 90 วันแล้ว',
      done_at DATETIME(3) NULL,
      updated_at DATETIME(3) NULL COMMENT 'ความเคลื่อนไหวล่าสุด',
      reporter_seen_at DATETIME(3) NULL COMMENT 'ผู้แจ้งเปิดดูล่าสุด',
      KEY idx_status (status),
      KEY idx_loginname (loginname),
      KEY idx_created (created_at)
    ) ${options} COMMENT='เรื่องแจ้งปัญหา / ข้อเสนอแนะ'`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ${t('feedback_history')} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      feedback_id CHAR(8) NOT NULL,
      time DATETIME(3) NOT NULL,
      status VARCHAR(16) NOT NULL,
      by_login VARCHAR(64) NOT NULL COMMENT 'ผู้ดูแลที่เปลี่ยนสถานะ',
      by_name VARCHAR(200) NULL,
      note TEXT NULL COMMENT 'ข้อความถึงผู้แจ้ง',
      KEY idx_feedback (feedback_id)
    ) ${options} COMMENT='ไทม์ไลน์สถานะของเรื่องแจ้งปัญหา'`);
    for (const name of ['audit_log', 'audit_log_archive'] as const) {
      await this.exec(`CREATE TABLE IF NOT EXISTS ${t(name)} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        time DATETIME(3) NOT NULL COMMENT 'UTC',
        loginname VARCHAR(64) NOT NULL COMMENT 'guest = ผู้เยี่ยมชม',
        action VARCHAR(32) NOT NULL,
        detail VARCHAR(500) NULL,
        ip VARCHAR(45) NULL,
        KEY idx_time (time),
        KEY idx_loginname (loginname),
        KEY idx_action (action)
      ) ${options} COMMENT='${name === 'audit_log' ? 'ประวัติการใช้งาน (180 วันล่าสุด)' : 'ประวัติการใช้งานที่เก่ากว่า 180 วัน'}'`);
    }
    await this.exec(`CREATE TABLE IF NOT EXISTS ${t('user_settings')} (
      loginname VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL COMMENT 'เช่น feedback_bell_seen',
      value VARCHAR(255) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (loginname, name)
    ) ${options} COMMENT='ค่าตั้งของผู้ใช้แต่ละคน (เห็นตรงกันทุกเครื่อง)'`);
    const oldLoginFailures = await this.rows<RowDataPacket>(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'throttle_key'`,
      [`${process.env.DASHBOARD_DB_TABLE_PREFIX ?? ''}login_failures`]);
    if (oldLoginFailures.length) await this.exec(`DROP TABLE ${t('login_failures')}`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ${t('login_failures')} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      loginname VARCHAR(64) NOT NULL COMMENT 'ชื่อที่พิมพ์ในช่อง login (ไม่ได้ยืนยันว่ามีบัญชีจริง)',
      ip VARCHAR(45) NOT NULL COMMENT 'IP เครื่องที่ใช้',
      time DATETIME(3) NOT NULL,
      KEY idx_login_ip_time (loginname, ip, time)
    ) ${options} COMMENT='login ผิด — ผิด 5 ครั้งใน 5 นาที พักการ login'`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ${t('users_seen')} (
      loginname VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(200) NULL,
      groupname VARCHAR(100) NULL,
      position VARCHAR(200) NULL,
      role VARCHAR(16) NULL COMMENT 'user / admin',
      first_login DATETIME(3) NULL,
      last_login DATETIME(3) NULL,
      login_count INT UNSIGNED NOT NULL DEFAULT 0,
      last_active DATETIME(3) NULL COMMENT 'เปิดหน้า/กดใช้งานล่าสุด',
      last_seen DATETIME(3) NULL COMMENT 'หน้าเว็บยังเปิดอยู่ล่าสุด (รวมการตรวจเบื้องหลังทุก 1 นาที)',
      last_ip VARCHAR(45) NULL,
      logged_out_at DATETIME(3) NULL COMMENT 'logout / session หมดอายุ ล่าสุด',
      KEY idx_last_seen (last_seen)
    ) ${options} COMMENT='ผู้ใช้ที่เคย login เข้าระบบ + สถานะออนไลน์'`);
  },

  async close() {
    await pool?.end().catch(() => undefined);
    pool = null;
  },
};
