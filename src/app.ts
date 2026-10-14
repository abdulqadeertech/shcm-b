import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { config } from './config/index.js';

import authRoutes from './modules/auth/auth.routes.js';
import orgRoutes from './modules/organization/organization.routes.js';
import employeeRoutes from './modules/employee/employee.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import recruitmentRoutes from './modules/recruitment/recruitment.routes.js';
import performanceRoutes from './modules/performance/performance.routes.js';
import assetRoutes from './modules/assets/assets.routes.js';
import helpdeskRoutes from './modules/helpdesk/helpdesk.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import workflowRoutes from './modules/workflow/workflow.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import superadminRoutes from './modules/superadmin/superadmin.routes.js';
import contactRoutes from './modules/contact/contact.routes.js';

export const app = express();


// Robust CORS Handling
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(cors({
  origin: true,
  credentials: true,
}));
app.options('*', cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SmartHCM Enterprise API',
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', orgRoutes);
app.use('/api/v1/organization', orgRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/payroll', payrollRoutes);
app.use('/api/v1/recruitment', recruitmentRoutes);
app.use('/api/v1/performance', performanceRoutes);
app.use('/api/v1/assets', assetRoutes);
app.use('/api/v1/helpdesk', helpdeskRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/v1/system', systemRoutes);
app.use('/api/v1/superadmin', superadminRoutes);
app.use('/api/v1/contact', contactRoutes);

// Centralized Error Handling

app.use(errorHandler);
