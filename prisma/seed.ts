import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting NovaHCM database seeding...');

  // 1. Clean existing records (in order of relations)
  await prisma.savedReport.deleteMany();
  await prisma.countryPayrollPolicy.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.offboardingChecklist.deleteMany();
  await prisma.onboardingChecklist.deleteMany();
  await prisma.approvalDelegation.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalWorkflow.deleteMany();
  await prisma.salaryRevision.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.expenseClaim.deleteMany();
  await prisma.employeeLoan.deleteMany();
  await prisma.assetAssignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.trainingEnrollment.deleteMany();
  await prisma.trainingCourse.deleteMany();
  await prisma.employeeGoal.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.performanceReviewCycle.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.jobRequisition.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.employeeSalary.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.attendanceCorrectionRequest.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Organization
  const acme = await prisma.organization.create({
    data: {
      name: 'Acme Global Technologies Inc.',
      slug: 'acme-global',
      timezone: 'America/New_York',
      currency: 'USD',
      address: '100 Tech Boulevard, Suite 500, New York, NY 10001',
      phone: '+1 212-555-0199',
      email: 'hr@acmeglobal.com',
    },
  });

  console.log('✅ Created Organization:', acme.name);

  // 3. Branches
  const nyBranch = await prisma.branch.create({
    data: {
      organizationId: acme.id,
      name: 'New York Headquarters',
      code: 'NY-HQ',
      address: '100 Tech Blvd, 5th Floor',
      city: 'New York',
      country: 'United States',
      isHeadOffice: true,
    },
  });

  const lonBranch = await prisma.branch.create({
    data: {
      organizationId: acme.id,
      name: 'London Innovation Center',
      code: 'LON-HUB',
      address: '25 Bank Street, Canary Wharf',
      city: 'London',
      country: 'United Kingdom',
      isHeadOffice: false,
    },
  });

  // 4. Departments
  const deptEng = await prisma.department.create({
    data: {
      organizationId: acme.id,
      name: 'Engineering & Technology',
      code: 'ENG',
      description: 'Software development, cloud infrastructure, QA and architecture.',
    },
  });

  const deptHR = await prisma.department.create({
    data: {
      organizationId: acme.id,
      name: 'People Operations & HR',
      code: 'HR',
      description: 'Talent management, employee relations, payroll and compliance.',
    },
  });

  const deptFin = await prisma.department.create({
    data: {
      organizationId: acme.id,
      name: 'Finance & Accounting',
      code: 'FIN',
      description: 'Financial planning, payroll disbursement and treasury.',
    },
  });

  const deptProd = await prisma.department.create({
    data: {
      organizationId: acme.id,
      name: 'Product & Design',
      code: 'PROD',
      description: 'Product strategy, roadmap execution and UX/UI design.',
    },
  });

  // 5. Designations
  const desigVPHR = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'VP of People Operations',
      code: 'VP-HR',
      grade: 'Executive (E1)',
    },
  });

  const desigHRMgr = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'HR Operations Manager',
      code: 'MGR-HR',
      grade: 'Management (M2)',
    },
  });

  const desigEngMgr = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'Engineering Director',
      code: 'DIR-ENG',
      grade: 'Executive (E2)',
    },
  });

  const desigSrEng = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'Senior Full Stack Engineer',
      code: 'SR-SWE',
      grade: 'Senior IC (IC4)',
    },
  });

  const desigPayrollMgr = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'Payroll & Benefits Manager',
      code: 'MGR-PAY',
      grade: 'Management (M1)',
    },
  });

  const desigDevOps = await prisma.designation.create({
    data: {
      organizationId: acme.id,
      name: 'Lead Cloud DevOps Engineer',
      code: 'LEAD-OPS',
      grade: 'Lead IC (IC5)',
    },
  });

  // 6. Shifts
  const regularShift = await prisma.shift.create({
    data: {
      organizationId: acme.id,
      name: 'Standard Business Shift',
      code: 'GEN-01',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMinutes: 15,
      halfDayThresholdHours: 4.5,
      isOvernight: false,
    },
  });

  // 7. Password hash for test users: Password123!
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 8. Users & Memberships & Employees
  const usersData = [
    {
      email: 'admin@novahcm.io',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'PLATFORM_SUPER_ADMIN',
      isSuperAdmin: true,
      phone: '+1 800-555-0100',
      code: 'EMP-001',
      deptId: deptHR.id,
      desigId: desigVPHR.id,
      baseSalary: 14500,
      gender: 'PREFER_NOT_TO_SAY',
    },
    {
      email: 'sarah.jenkins@acmeglobal.com',
      firstName: 'Sarah',
      lastName: 'Jenkins',
      role: 'HR_MANAGER',
      isSuperAdmin: false,
      phone: '+1 212-555-0144',
      code: 'EMP-002',
      deptId: deptHR.id,
      desigId: desigHRMgr.id,
      baseSalary: 9500,
      gender: 'FEMALE',
    },
    {
      email: 'david.miller@acmeglobal.com',
      firstName: 'David',
      lastName: 'Miller',
      role: 'PAYROLL_MANAGER',
      isSuperAdmin: false,
      phone: '+1 212-555-0182',
      code: 'EMP-003',
      deptId: deptFin.id,
      desigId: desigPayrollMgr.id,
      baseSalary: 9200,
      gender: 'MALE',
    },
    {
      email: 'alex.rivers@acmeglobal.com',
      firstName: 'Alex',
      lastName: 'Rivers',
      role: 'DEPT_MANAGER',
      isSuperAdmin: false,
      phone: '+1 212-555-0167',
      code: 'EMP-004',
      deptId: deptEng.id,
      desigId: desigEngMgr.id,
      baseSalary: 12500,
      gender: 'MALE',
    },
    {
      email: 'emily.watson@acmeglobal.com',
      firstName: 'Emily',
      lastName: 'Watson',
      role: 'EMPLOYEE',
      isSuperAdmin: false,
      phone: '+1 212-555-0112',
      code: 'EMP-005',
      deptId: deptEng.id,
      desigId: desigSrEng.id,
      baseSalary: 8800,
      gender: 'FEMALE',
    },
    {
      email: 'james.chen@acmeglobal.com',
      firstName: 'James',
      lastName: 'Chen',
      role: 'EMPLOYEE',
      isSuperAdmin: false,
      phone: '+1 212-555-0193',
      code: 'EMP-006',
      deptId: deptEng.id,
      desigId: desigDevOps.id,
      baseSalary: 9800,
      gender: 'MALE',
    },
    {
      email: 'claire.foster@acmeglobal.com',
      firstName: 'Claire',
      lastName: 'Foster',
      role: 'RECRUITER',
      isSuperAdmin: false,
      phone: '+1 212-555-0177',
      code: 'EMP-007',
      deptId: deptHR.id,
      desigId: desigHRMgr.id,
      baseSalary: 7500,
      gender: 'FEMALE',
    },
  ];

  const createdEmployees: Record<string, any> = {};

  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        isActive: true,
        isSuperAdmin: u.isSuperAdmin,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: acme.id,
        role: u.role,
        isDefault: true,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        organizationId: acme.id,
        userId: user.id,
        employeeCode: u.code,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        gender: u.gender,
        dateOfBirth: new Date('1990-05-15'),
        nationalId: `ID-${1000 + parseInt(u.code.split('-')[1])}`,
        maritalStatus: 'SINGLE',
        address: '450 Lexington Ave, New York, NY',
        emergencyContactName: 'Contact for ' + u.firstName,
        emergencyContactPhone: '+1 212-555-9999',
        emergencyContactRelation: 'Family',
        departmentId: u.deptId,
        designationId: u.desigId,
        branchId: nyBranch.id,
        shiftId: regularShift.id,
        employmentType: 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        dateOfJoining: new Date('2023-02-01'),
      },
    });

    await prisma.employeeSalary.create({
      data: {
        organizationId: acme.id,
        employeeId: employee.id,
        baseSalary: u.baseSalary,
        currency: 'USD',
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'JPMorgan Chase',
        accountNumber: `**** **** 42${u.code.split('-')[1]}`,
      },
    });

    createdEmployees[u.code] = employee;
  }

  // Set manager hierarchy: Alex Rivers (EMP-004) manages Emily (EMP-005) & James (EMP-006)
  if (createdEmployees['EMP-004']) {
    await prisma.employee.update({
      where: { id: createdEmployees['EMP-005'].id },
      data: { reportingManagerId: createdEmployees['EMP-004'].id },
    });
    await prisma.employee.update({
      where: { id: createdEmployees['EMP-006'].id },
      data: { reportingManagerId: createdEmployees['EMP-004'].id },
    });
  }

  // 9. Leave Types & Balances
  const annualLeave = await prisma.leaveType.create({
    data: {
      organizationId: acme.id,
      name: 'Annual Paid Leave',
      code: 'AL',
      daysAllowed: 20,
      isPaid: true,
      carryForwardMax: 5,
      description: 'Standard statutory annual vacation allowance.',
    },
  });

  const sickLeave = await prisma.leaveType.create({
    data: {
      organizationId: acme.id,
      name: 'Medical & Sick Leave',
      code: 'SL',
      daysAllowed: 10,
      isPaid: true,
      carryForwardMax: 0,
      description: 'Leave for illness, medical appointments, or recovery.',
    },
  });

  const casualLeave = await prisma.leaveType.create({
    data: {
      organizationId: acme.id,
      name: 'Casual / Personal Leave',
      code: 'CL',
      daysAllowed: 7,
      isPaid: true,
      carryForwardMax: 0,
      description: 'Leave for personal, urgent or family matters.',
    },
  });

  // Initialize 2026 Leave Balances for all employees
  for (const emp of Object.values(createdEmployees)) {
    await prisma.leaveBalance.createMany({
      data: [
        {
          organizationId: acme.id,
          employeeId: emp.id,
          leaveTypeId: annualLeave.id,
          year: 2026,
          allocatedDays: 20,
          usedDays: 3,
          pendingDays: 1,
          remainingDays: 16,
        },
        {
          organizationId: acme.id,
          employeeId: emp.id,
          leaveTypeId: sickLeave.id,
          year: 2026,
          allocatedDays: 10,
          usedDays: 1,
          pendingDays: 0,
          remainingDays: 9,
        },
        {
          organizationId: acme.id,
          employeeId: emp.id,
          leaveTypeId: casualLeave.id,
          year: 2026,
          allocatedDays: 7,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: 7,
        },
      ],
    });
  }

  // 10. Sample Leave Requests
  await prisma.leaveRequest.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id, // Emily Watson
      leaveTypeId: annualLeave.id,
      startDate: new Date('2026-10-15T00:00:00.000Z'),
      endDate: new Date('2026-10-16T23:59:59.000Z'),
      totalDays: 2,
      isHalfDay: false,
      reason: 'Attending family celebration and annual personal recharge.',
      status: 'PENDING',
    },
  });

  await prisma.leaveRequest.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-006'].id, // James Chen
      leaveTypeId: sickLeave.id,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-10T23:59:59.000Z'),
      totalDays: 1,
      isHalfDay: false,
      reason: 'Viral fever rest and recuperation.',
      status: 'APPROVED',
      reviewerNotes: 'Approved as per medical policy.',
    },
  });

  // 11. Attendance Records (Last 7 working days)
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const dayDate = new Date();
    dayDate.setDate(now.getDate() - i);
    dayDate.setHours(0, 0, 0, 0);

    // Skip Sundays
    if (dayDate.getDay() === 0) continue;

    for (const emp of Object.values(createdEmployees)) {
      const clockIn = new Date(dayDate);
      // Random arrival between 08:50 and 09:20
      const arrivalMin = 50 + (i * 3) % 30;
      clockIn.setHours(8, arrivalMin, 0);

      const clockOut = new Date(dayDate);
      clockOut.setHours(18, 5, 0);

      const totalHours = Number(((clockOut.getTime() - clockIn.getTime()) / (1000 * 3600)).toFixed(2));
      const lateMinutes = arrivalMin > 60 ? arrivalMin - 60 : 0;

      await prisma.attendanceRecord.create({
        data: {
          organizationId: acme.id,
          employeeId: emp.id,
          date: dayDate,
          clockIn,
          clockOut,
          totalHours,
          lateMinutes: lateMinutes > 15 ? lateMinutes - 15 : 0,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          status: 'PRESENT',
          isManualEntry: false,
        },
      });
    }
  }

  // 12. Salary Structure
  await prisma.salaryStructure.create({
    data: {
      organizationId: acme.id,
      name: 'Standard North America Tech Structure',
      basicPercentage: 50,
      hraPercentage: 20,
      conveyanceAllowance: 10,
      medicalAllowance: 5,
      specialAllowance: 15,
      pfPercentage: 12,
      taxDeductionPercentage: 5,
    },
  });

  // 13. Payroll Runs & Payslips
  const prevRun = await prisma.payrollRun.create({
    data: {
      organizationId: acme.id,
      periodMonth: 9,
      periodYear: 2026,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      totalGross: 62000,
      totalDeductions: 10540,
      totalNet: 51460,
      status: 'FINALIZED',
      approvedAt: new Date('2026-09-30T17:00:00Z'),
    },
  });

  for (const emp of Object.values(createdEmployees)) {
    const salary = await prisma.employeeSalary.findUnique({ where: { employeeId: emp.id } });
    const gross = salary?.baseSalary || 8000;
    const basic = gross * 0.5;
    const allowances = gross * 0.5;
    const deductions = gross * 0.17; // 12% PF + 5% Tax
    const net = gross - deductions;

    await prisma.payslip.create({
      data: {
        organizationId: acme.id,
        payrollRunId: prevRun.id,
        employeeId: emp.id,
        periodMonth: 9,
        periodYear: 2026,
        basicPay: basic,
        allowances,
        overtimePay: 0,
        grossPay: gross,
        deductions,
        taxDeducted: gross * 0.05,
        netPay: net,
        paymentStatus: 'PAID',
        paymentDate: new Date('2026-09-30'),
      },
    });
  }

  // Draft Payroll Run for Current Month (ready to preview/finalize in UI!)
  await prisma.payrollRun.create({
    data: {
      organizationId: acme.id,
      periodMonth: 10,
      periodYear: 2026,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      totalGross: 62000,
      totalDeductions: 10540,
      totalNet: 51460,
      status: 'DRAFT',
    },
  });

  // 14. Recruitment Requisitions & Candidates
  const jobReqSWE = await prisma.jobRequisition.create({
    data: {
      organizationId: acme.id,
      title: 'Senior Full Stack Engineer (React/Node/Postgres)',
      departmentId: deptEng.id,
      location: 'New York HQ / Hybrid',
      jobType: 'FULL_TIME',
      experienceLevel: 'SENIOR',
      salaryMin: 130000,
      salaryMax: 165000,
      description: 'We are seeking an experienced Full Stack engineer to design and scale enterprise cloud solutions.',
      requirements: '5+ years Node.js, TypeScript, React, SQL databases, distributed architectures.',
      status: 'OPEN',
    },
  });

  const jobReqHR = await prisma.jobRequisition.create({
    data: {
      organizationId: acme.id,
      title: 'Talent Acquisition Partner',
      departmentId: deptHR.id,
      location: 'New York HQ',
      jobType: 'FULL_TIME',
      experienceLevel: 'MID_LEVEL',
      salaryMin: 85000,
      salaryMax: 105000,
      description: 'Manage full-cycle technical recruiting and candidate engagement.',
      requirements: '3+ years tech recruiting experience, strong candidate management skills.',
      status: 'OPEN',
    },
  });

  const candidate1 = await prisma.candidate.create({
    data: {
      organizationId: acme.id,
      jobRequisitionId: jobReqSWE.id,
      firstName: 'Daniel',
      lastName: 'Kovacs',
      email: 'daniel.kovacs@example.com',
      phone: '+1 646-555-0811',
      stage: 'INTERVIEW',
      rating: 5,
      notes: 'Strong system design skills, excellent React and Postgres relational modeling experience.',
    },
  });

  await prisma.interview.create({
    data: {
      candidateId: candidate1.id,
      interviewerName: 'Alex Rivers',
      scheduledAt: new Date(Date.now() + 86400000 * 2),
      locationOrLink: 'https://meet.google.com/novahcm-int-swe',
      outcome: 'SCHEDULED',
    },
  });

  await prisma.candidate.create({
    data: {
      organizationId: acme.id,
      jobRequisitionId: jobReqSWE.id,
      firstName: 'Maya',
      lastName: 'Patel',
      email: 'maya.patel@example.com',
      phone: '+1 917-555-0234',
      stage: 'SCREENING',
      rating: 4,
      notes: 'Reviewing code sample and frontend architectural portfolio.',
    },
  });

  // 15. Assets
  const laptop = await prisma.asset.create({
    data: {
      organizationId: acme.id,
      name: 'MacBook Pro 16" M3 Max (36GB/1TB)',
      assetCode: 'AST-1001',
      category: 'LAPTOP',
      serialNumber: 'C02G879HMD6R',
      purchaseDate: new Date('2024-01-15'),
      cost: 3499,
      condition: 'EXCELLENT',
      status: 'ASSIGNED',
    },
  });

  await prisma.assetAssignment.create({
    data: {
      organizationId: acme.id,
      assetId: laptop.id,
      employeeId: createdEmployees['EMP-005'].id,
      assignedDate: new Date('2024-01-20'),
      notes: 'Issued with carrying case and USB-C power adapter.',
    },
  });

  await prisma.asset.create({
    data: {
      organizationId: acme.id,
      name: 'Dell UltraSharp 27" 4K USB-C Hub Monitor',
      assetCode: 'AST-1002',
      category: 'MONITOR',
      serialNumber: 'CN-0M3817-72872',
      purchaseDate: new Date('2024-02-10'),
      cost: 620,
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
    },
  });

  // 16. Support Tickets
  await prisma.supportTicket.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id,
      subject: 'Ergonomic dual monitor arm setup request',
      description: 'Requesting an adjustable dual monitor arm for desk workstation 4B to improve posture.',
      category: 'IT',
      priority: 'MEDIUM',
      status: 'OPEN',
    },
  });

  await prisma.supportTicket.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-006'].id,
      subject: 'Comprehensive Dental & Vision Coverage Confirmation',
      description: 'Would like clarification on whether dependent dental prophylaxis is covered under Plan B.',
      category: 'BENEFITS',
      priority: 'LOW',
      status: 'IN_PROGRESS',
      resolutionNotes: 'Benefits specialist reviewing provider network documentation.',
    },
  });

  // 17. Training Courses & Goals
  const course = await prisma.trainingCourse.create({
    data: {
      organizationId: acme.id,
      title: 'Enterprise Security, SOC2 & Data Privacy Essentials',
      description: 'Mandatory annual training on data encryption, phishing prevention, and credential hygiene.',
      category: 'COMPLIANCE',
      durationHours: 3.5,
      provider: 'NovaHCM Academy',
    },
  });

  await prisma.trainingEnrollment.create({
    data: {
      organizationId: acme.id,
      courseId: course.id,
      employeeId: createdEmployees['EMP-005'].id,
      status: 'COMPLETED',
      score: 98,
      completedAt: new Date('2026-08-15'),
    },
  });

  await prisma.employeeGoal.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id,
      title: 'Deploy Automated CI/CD Pipeline for Micro-Frontend Modules',
      description: 'Reduce build times below 3 minutes and implement automated preview deployments.',
      targetDate: new Date('2026-11-30'),
      progressPercentage: 75,
      status: 'IN_PROGRESS',
    },
  });

  // 18. Expenses & Loans
  await prisma.expenseClaim.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id,
      title: 'Professional Cloud Certification Exam Fee',
      category: 'TRAINING',
      amount: 300,
      currency: 'USD',
      description: 'Reimbursement for AWS Certified Solutions Architect exam pass.',
      status: 'APPROVED',
    },
  });

  // 19. Advanced Salary Revision History
  await prisma.salaryRevision.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id,
      effectiveDate: new Date('2026-01-01'),
      previousBase: 7000,
      newBase: 8000,
      changeReason: 'PROMOTION',
      changedBy: 'sarah.jenkins@acmeglobal.com',
    },
  });
  await prisma.salaryRevision.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-001'].id,
      effectiveDate: new Date('2025-07-01'),
      previousBase: 9000,
      newBase: 10000,
      changeReason: 'ANNUAL_REVIEW',
      changedBy: 'admin@novahcm.io',
    },
  });

  // 20. Configurable Multi-Step Approval Workflows
  const leaveWorkflow = await prisma.approvalWorkflow.create({
    data: {
      organizationId: acme.id,
      name: 'Standard Leave Multi-tier Approval',
      workflowType: 'LEAVE',
      isActive: true,
      steps: {
        create: [
          { stepOrder: 1, approverRole: 'DEPT_MANAGER' },
          { stepOrder: 2, approverRole: 'HR_MANAGER' },
        ],
      },
    },
  });

  const attendanceWorkflow = await prisma.approvalWorkflow.create({
    data: {
      organizationId: acme.id,
      name: 'Attendance Correction Approval',
      workflowType: 'ATTENDANCE_CORRECTION',
      isActive: true,
      steps: {
        create: [
          { stepOrder: 1, approverRole: 'DEPT_MANAGER' },
        ],
      },
    },
  });

  const payrollWorkflow = await prisma.approvalWorkflow.create({
    data: {
      organizationId: acme.id,
      name: 'Monthly Payroll Audit & Release',
      workflowType: 'PAYROLL_RUN',
      isActive: true,
      steps: {
        create: [
          { stepOrder: 1, approverRole: 'PAYROLL_MANAGER' },
          { stepOrder: 2, approverRole: 'HR_DIRECTOR' },
        ],
      },
    },
  });

  // Sample pending and approved approval requests
  const sampleRequest1 = await prisma.approvalRequest.create({
    data: {
      organizationId: acme.id,
      workflowId: leaveWorkflow.id,
      entityType: 'LEAVE_REQUEST',
      entityId: 'REQ-LEAVE-2026-01',
      requesterId: createdEmployees['EMP-005'].id,
      requesterName: 'Emily Watson',
      currentStepOrder: 2,
      totalSteps: 2,
      status: 'PENDING',
      summary: 'Annual Leave: 3 days (Personal Family Event)',
      actions: {
        create: [
          {
            stepOrder: 1,
            actorId: createdEmployees['EMP-004'].id,
            actorEmail: 'alex.rivers@acmeglobal.com',
            actorRole: 'DEPT_MANAGER',
            action: 'APPROVED',
            comments: 'Project coverage confirmed with engineering team.',
          },
        ],
      },
    },
  });

  // 21. Approval Delegation
  await prisma.approvalDelegation.create({
    data: {
      organizationId: acme.id,
      delegatorUserId: 'user-dept-manager-id',
      delegatorEmail: 'alex.rivers@acmeglobal.com',
      delegateUserId: 'user-hr-manager-id',
      delegateEmail: 'sarah.jenkins@acmeglobal.com',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-10'),
      reason: 'Attending European Tech Leadership Summit',
      isActive: true,
    },
  });

  // 22. Onboarding & Offboarding Checklists
  const onboarding = await prisma.onboardingChecklist.create({
    data: {
      organizationId: acme.id,
      employeeId: createdEmployees['EMP-005'].id,
      status: 'IN_PROGRESS',
      items: {
        create: [
          { title: 'Provision Corporate Laptop & Single Sign-On Access', category: 'IT', isCompleted: true, completedBy: 'Admin IT' },
          { title: 'Sign Non-Disclosure & Employment Agreement', category: 'HR', isCompleted: true, completedBy: 'Sarah Jenkins' },
          { title: 'Enroll in Direct Deposit & Tax W-4 Forms', category: 'FINANCE', isCompleted: true, completedBy: 'David Miller' },
          { title: 'Complete Security Awareness & SOC2 Compliance Training', category: 'COMPLIANCE', isCompleted: false },
        ],
      },
    },
  });

  // 23. Announcements & Company Communications
  await prisma.announcement.createMany({
    data: [
      {
        organizationId: acme.id,
        title: 'Q4 Global All-Hands & Product Innovation Showcase',
        content: 'Join CEO and executive leadership this Thursday at 2:00 PM EST for our quarterly company updates, roadmap presentation, and employee excellence awards.',
        category: 'GENERAL',
        authorName: 'Sarah Jenkins (HR)',
        isPinned: true,
      },
      {
        organizationId: acme.id,
        title: 'Updated 2026 Comprehensive Health & Fitness Benefit Stipend',
        content: 'Employees are now eligible for up to $150/month reimbursement towards gym memberships, wellness programs, and mental health counseling.',
        category: 'POLICY',
        authorName: 'David Miller (Benefits)',
        isPinned: false,
      },
      {
        organizationId: acme.id,
        title: 'Upcoming Thanksgiving & Public Holiday Office Roster',
        content: 'Offices will observe official holiday closure on November 26-27. Critical support on-call rotations have been scheduled in the Shift Roster.',
        category: 'CELEBRATION',
        authorName: 'Operations Team',
        isPinned: false,
      },
    ],
  });

  // 24. Country-Specific Statutory Payroll Policies
  await prisma.countryPayrollPolicy.createMany({
    data: [
      {
        organizationId: acme.id,
        countryCode: 'US',
        countryName: 'United States',
        currency: 'USD',
        statutoryRulesJson: JSON.stringify({
          socialSecurityRate: 6.2,
          medicareRate: 1.45,
          standardFederalTaxRate: 12.0,
          overtimeMultiplier: 1.5,
          statutoryNotes: 'FLSA non-exempt weekly 40h standard. Overtime multiplier 1.5x after 40 hours.',
        }),
        isReviewed: true,
        reviewedBy: 'David Miller (Payroll Lead)',
        reviewedAt: new Date('2026-01-15'),
      },
      {
        organizationId: acme.id,
        countryCode: 'UK',
        countryName: 'United Kingdom',
        currency: 'GBP',
        statutoryRulesJson: JSON.stringify({
          nationalInsuranceRate: 8.0,
          workplacePensionRate: 5.0,
          standardTaxBand: 20.0,
          overtimeMultiplier: 1.5,
          statutoryNotes: 'HMRC PAYE real-time reporting standards with statutory sick and parental pay schemes.',
        }),
        isReviewed: true,
        reviewedBy: 'David Miller (Payroll Lead)',
        reviewedAt: new Date('2026-01-15'),
      },
      {
        organizationId: acme.id,
        countryCode: 'AE',
        countryName: 'United Arab Emirates',
        currency: 'AED',
        statutoryRulesJson: JSON.stringify({
          personalIncomeTax: 0.0,
          gratuityFormulaDays: 21,
          basicSalaryRatio: 60.0,
          overtimeMultiplier: 1.25,
          statutoryNotes: 'UAE Federal Labor Law No. 33. End of Service Gratuity calculated on 21 days basic pay per year.',
        }),
        isReviewed: true,
        reviewedBy: 'Sarah Jenkins (HR Manager)',
        reviewedAt: new Date('2026-02-01'),
      },
      {
        organizationId: acme.id,
        countryCode: 'PK',
        countryName: 'Pakistan',
        currency: 'PKR',
        statutoryRulesJson: JSON.stringify({
          eobiEmployeeShare: 1.0,
          eobiEmployerShare: 5.0,
          pfEmployeeShare: 10.0,
          taxExemptionThreshold: 600000,
          overtimeMultiplier: 2.0,
          statutoryNotes: 'FBR Income Tax Ordinance 2001 (Updated 2026). Overtime calculated at double the regular hourly rate.',
        }),
        isReviewed: true,
        reviewedBy: 'Sarah Jenkins (HR Manager)',
        reviewedAt: new Date('2026-02-01'),
      },
    ],
  });

  // 25. Saved Reports
  await prisma.savedReport.createMany({
    data: [
      {
        organizationId: acme.id,
        userId: 'admin-user-id',
        title: 'Monthly Department Attendance & Punctuality Variance',
        reportType: 'ATTENDANCE',
        filtersJson: JSON.stringify({ dateRange: 'LAST_30_DAYS', status: 'ALL' }),
        isPublic: true,
      },
      {
        organizationId: acme.id,
        userId: 'admin-user-id',
        title: 'Q3 Executive Gross Compensation & Withholding Summary',
        reportType: 'PAYROLL',
        filtersJson: JSON.stringify({ year: 2026, quarters: ['Q3'] }),
        isPublic: true,
      },
    ],
  });

  // 26. Audit Events
  await prisma.auditEvent.create({
    data: {
      organizationId: acme.id,
      actorEmail: 'admin@novahcm.io',
      action: 'SYSTEM_BOOTSTRAP',
      entityType: 'ORGANIZATION',
      entityId: acme.id,
      detailsJson: JSON.stringify({ message: 'NovaHCM enterprise multi-tenant instance initialized' }),
      ipAddress: '127.0.0.1',
    },
  });

  console.log('🎉 Database seeding completed successfully!');
  console.log('----------------------------------------------------');
  console.log('Default credentials for testing:');
  console.log('Admin:       admin@novahcm.io / Password123!');
  console.log('HR Manager:  sarah.jenkins@acmeglobal.com / Password123!');
  console.log('Payroll:     david.miller@acmeglobal.com / Password123!');
  console.log('Manager:     alex.rivers@acmeglobal.com / Password123!');
  console.log('Employee:    emily.watson@acmeglobal.com / Password123!');
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
