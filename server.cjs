const express = require('express');
const { Pool } = require('pg');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        date_of_birth DATE NOT NULL,
        ssn VARCHAR(11),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        emergency_contact_name VARCHAR(200),
        emergency_contact_phone VARCHAR(20),
        insurance_provider VARCHAR(200),
        insurance_policy_number VARCHAR(100),
        medicaid_number VARCHAR(50),
        admission_date DATE DEFAULT CURRENT_DATE,
        discharge_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        primary_diagnosis TEXT,
        secondary_diagnosis TEXT,
        risk_level VARCHAR(20) DEFAULT 'low',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinicians (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        license_number VARCHAR(50) UNIQUE NOT NULL,
        license_type VARCHAR(50) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        department VARCHAR(100),
        hire_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'active',
        supervisor_id INTEGER REFERENCES clinicians(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS treatment_plans (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        clinician_id INTEGER REFERENCES clinicians(id),
        plan_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        goals TEXT NOT NULL,
        objectives TEXT NOT NULL,
        interventions TEXT NOT NULL,
        frequency VARCHAR(100),
        estimated_duration VARCHAR(100),
        review_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_notes (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        clinician_id INTEGER REFERENCES clinicians(id),
        session_date DATE NOT NULL,
        session_type VARCHAR(50) NOT NULL,
        duration_minutes INTEGER,
        presenting_concerns TEXT,
        assessment TEXT,
        interventions_used TEXT,
        client_response TEXT,
        progress_notes TEXT,
        follow_up_plan TEXT,
        risk_assessment VARCHAR(50),
        medication_compliance VARCHAR(50),
        homework_assignments TEXT,
        next_session_date DATE,
        billing_code VARCHAR(20),
        supervision_reviewed BOOLEAN DEFAULT false,
        supervisor_notes TEXT,
        tags TEXT DEFAULT '[IGM-GOVERNED]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crisis_incidents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        clinician_id INTEGER REFERENCES clinicians(id),
        incident_date TIMESTAMP NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        severity_level VARCHAR(20) NOT NULL,
        location VARCHAR(200),
        description TEXT NOT NULL,
        triggers TEXT,
        interventions_taken TEXT,
        law_enforcement_involved BOOLEAN DEFAULT false,
        hospitalization_required BOOLEAN DEFAULT false,
        hospital_name VARCHAR(200),
        outcome TEXT,
        follow_up_required BOOLEAN DEFAULT true,
        follow_up_date DATE,
        family_notified BOOLEAN DEFAULT false,
        insurance_notified BOOLEAN DEFAULT false,
        incident_report_filed BOOLEAN DEFAULT false,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_audits (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        audit_date DATE NOT NULL,
        audit_type VARCHAR(50) NOT NULL,
        auditor_name VARCHAR(200),
        insurance_company VARCHAR(200),
        services_reviewed TEXT,
        date_range_start DATE,
        date_range_end DATE,
        total_services_reviewed INTEGER,
        approved_services INTEGER,
        denied_services INTEGER,
        pending_services INTEGER,
        total_amount_billed DECIMAL(10,2),
        approved_amount DECIMAL(10,2),
        denied_amount DECIMAL(10,2),
        findings TEXT,
        corrective_actions TEXT,
        appeal_required BOOLEAN DEFAULT false,
        appeal_filed BOOLEAN DEFAULT false,
        appeal_outcome VARCHAR(50),
        compliance_rating VARCHAR(20),
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS outcome_measures (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        clinician_id INTEGER REFERENCES clinicians(id),
        assessment_date DATE NOT NULL,
        assessment_type VARCHAR(100) NOT NULL,
        measurement_tool VARCHAR(100),
        baseline_score DECIMAL(5,2),
        current_score DECIMAL(5,2),
        target_score DECIMAL(5,2),
        improvement_percentage DECIMAL(5,2),
        functional_level VARCHAR(50),
        quality_of_life_score DECIMAL(5,2),
        symptom_severity VARCHAR(50),
        social_functioning_score DECIMAL(5,2),
        occupational_functioning_score DECIMAL(5,2),
        housing_stability VARCHAR(50),
        medication_adherence_percentage DECIMAL(5,2),
        hospitalization_days_current_period INTEGER DEFAULT 0,
        hospitalization_days_previous_period INTEGER DEFAULT 0,
        crisis_incidents_current_period INTEGER DEFAULT 0,
        crisis_incidents_previous_period INTEGER DEFAULT 0,
        goals_met INTEGER DEFAULT 0,
        goals_total INTEGER DEFAULT 0,
        notes TEXT,
        next_assessment_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        subject VARCHAR(300),
        message TEXT,
        contact_type VARCHAR(50) DEFAULT 'general',
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// Client CRUD operations
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             COUNT(DISTINCT cn.id) as total_notes,
             COUNT(DISTINCT tp.id) as active_treatment_plans,
             COUNT(DISTINCT ci.id) as crisis_incidents
      FROM clients c
      LEFT JOIN clinical_notes cn ON c.id = cn.client_id
      LEFT JOIN treatment_plans tp ON c.id = tp.client_id AND tp.status = 'active'
      LEFT JOIN crisis_incidents ci ON c.id = ci.client_id
      GROUP BY c.id
      ORDER BY c.last_name, c.first_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const {
      first_name, last_name, date_of_birth, ssn, phone, email, address,
      emergency_contact_name, emergency_contact_phone, insurance_provider,
      insurance_policy_number, medicaid_number, primary_diagnosis,
      secondary_diagnosis, risk_level
    } = req.body;

    const result = await pool.query(`
      INSERT INTO clients (
        first_name, last_name, date_of_birth, ssn, phone, email, address,
        emergency_contact_name, emergency_contact_phone, insurance_provider,
        insurance_policy_number, medicaid_number, primary_diagnosis,
        secondary_diagnosis, risk_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      first_name, last_name, date_of_birth, ssn, phone, email, address,
      emergency_contact_name, emergency_contact_phone, insurance_provider,
      insurance_policy_number, medicaid_number, primary_diagnosis,
      secondary_diagnosis, risk_level
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, date_of_birth, ssn, phone, email, address,
      emergency_contact_name, emergency_contact_phone, insurance_provider,
      insurance_policy_number, medicaid_number, primary_diagnosis,
      secondary_diagnosis, risk_level, status
    } = req.body;

    const result = await pool.query(`
      UPDATE clients SET
        first_name = $1, last_name = $2, date_of_birth = $3, ssn = $4,
        phone = $5, email = $6, address = $7, emergency_contact_name = $8,
        emergency_contact_phone = $9, insurance_provider = $10,
        insurance_policy_number = $11, medicaid_number = $12,
        primary_diagnosis = $13, secondary_diagnosis = $14,
        risk_level = $15, status = $16, updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *
    `, [
      first_name, last_name, date_of_birth, ssn, phone, email, address,
      emergency_contact_name, emergency_contact_phone, insurance_provider,
      insurance_policy_number, medicaid_number, primary_diagnosis,
      secondary_diagnosis, risk_level, status, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Clinician CRUD operations
app.get('/api/clinicians', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             s.first_name as supervisor_first_name,
             s.last_name as supervisor_last_name,
             COUNT(DISTINCT cn.id) as total_notes,
             COUNT(DISTINCT tp.id) as active_treatment_plans
      FROM clinicians c
      LEFT JOIN clinicians s ON c.supervisor_id = s.id
      LEFT JOIN clinical_notes cn ON c.id = cn.clinician_id
      LEFT JOIN treatment_plans tp ON c.id = tp.clinician_id AND tp.status = 'active'
      GROUP BY c.id, s.first_name, s.last_name
      ORDER BY c.last_name, c.first_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clinicians:', error);
    res.status(500).json({ error: 'Failed to fetch clinicians' });
  }
});

app.post('/api/clinicians', async (req, res) => {
  try {
    const {
      first_name, last_name, license_number, license_type, email,
      phone, department, supervisor_id
    } = req.body;

    const result = await pool.query(`
      INSERT INTO clinicians (
        first_name, last_name, license_number, license_type,
        email, phone, department, supervisor_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [first_name, last_name, license_number, license_type, email, phone, department, supervisor_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating clinician:', error);
    res.status(500).json({ error: 'Failed to create clinician' });
  }
});

// Treatment Plans CRUD operations
app.get('/api/treatment-plans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tp.*, 
             c.first_name || ' ' || c.last_name as client_name,
             cl.first_name || ' ' || cl.last_name as clinician_name
      FROM treatment_plans tp
      JOIN clients c ON tp.client_id = c.id
      JOIN clinicians cl ON tp.clinician_id = cl.id
      ORDER BY tp.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching treatment plans:', error);
    res.status(500).json({ error: 'Failed to fetch treatment plans' });
  }
});

app.get('/api/clients/:clientId/treatment-plans', async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(`
      SELECT tp.*, 
             cl.first_name || ' ' || cl.last_name as clinician_name
      FROM treatment_plans tp
      JOIN clinicians cl ON tp.clinician_id = cl.id
      WHERE tp.client_id = $1
      ORDER BY tp.created_at DESC
    `, [clientId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching treatment plans:', error);
    res.status(500).json({ error: 'Failed to fetch treatment plans' });
  }
});

app.post('/api/treatment-plans', async (req, res) => {
  try {
    const {
      client_id, clinician_id, plan_type, start_date, end_date,
      goals, objectives, interventions, frequency, estimated_duration,
      review_date, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO treatment_plans (
        client_id, clinician_id, plan_type, start_date, end_date,
        goals, objectives, interventions, frequency, estimated_duration,
        review_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      client_id, clinician_id, plan_type, start_date, end_date,
      goals, objectives, interventions, frequency, estimated_duration,
      review_date, notes
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating treatment plan:', error);
    res.status(500).json({ error: 'Failed to create treatment plan' });
  }
});

app.put('/api/treatment-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      plan_type, start_date, end_date, goals, objectives, interventions,
      frequency, estimated_duration, review_date, status, notes
    } = req.body;

    const result = await pool.query(`
      UPDATE treatment_plans SET
        plan_type = $1, start_date = $2, end_date = $3, goals = $4,
        objectives = $5, interventions = $6, frequency = $7,
        estimated_duration = $8, review_date = $9, status = $10,
        notes = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      plan_type, start_date, end_date, goals, objectives, interventions,
      frequency, estimated_duration, review_date, status, notes, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Treatment plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating treatment plan:', error);
    res.status(500).json({ error: 'Failed to update treatment plan' });
  }
});

// Clinical Notes CRUD operations
app.get('/api/clinical-notes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cn.*, 
             c.first_name || ' ' || c.last_name as client_name,
             cl.first_name || ' ' || cl.last_name as clin