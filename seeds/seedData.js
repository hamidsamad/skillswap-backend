import bcrypt from 'bcryptjs';
import { User, Profile, Skill, SwapAgreement, Conversation, Message, Report, AuditLog } from '../config/db.js';
import { store } from '../config/dbAdapter.js';

export async function seedDatabase() {
  console.log('🌱 Checking seed data status...');

  const userCount = await User.countDocuments();
  if (userCount > 0) {
    console.log(`✅ Database already contains ${userCount} users. Skipping initial seed.`);
    return;
  }

  console.log('⚡ Populating comprehensive SkillSwap Pakistan seed data...');

  // 1. Create Skills
  const skillsData = [
    {
      name: 'Full-Stack React & Node.js',
      category: 'Software & Tech',
      description: 'Modern web development with React, Express, Node.js, REST APIs, and responsive design.',
      icon: 'Code',
      isPopular: true
    },
    {
      name: 'Python & Machine Learning',
      category: 'Software & Tech',
      description: 'Python scripting, NumPy, Pandas, Scikit-Learn, PyTorch, and generative AI fundamentals.',
      icon: 'Brain',
      isPopular: true
    },
    {
      name: 'Figma UI/UX & Design Systems',
      category: 'Design & Creative',
      description: 'End-to-end interface design, responsive wireframes, design tokens, and interactive prototyping.',
      icon: 'Layout',
      isPopular: true
    },
    {
      name: 'Urdu Calligraphy (Khat-e-Nastaliq)',
      category: 'Language & Arts',
      description: 'Traditional Pakistani calligraphy, Qalam reed pen techniques, Nastaliq proportions and ink crafting.',
      icon: 'PenTool',
      isPopular: true
    },
    {
      name: 'Flutter Mobile App Development',
      category: 'Software & Tech',
      description: 'Cross-platform Android & iOS development with Dart, state management (Bloc/Riverpod).',
      icon: 'Smartphone',
      isPopular: true
    },
    {
      name: 'Digital Marketing & Daraz / Shopify E-Commerce',
      category: 'Business & Freelancing',
      description: 'Performance ads, Meta and Google campaign scaling, Daraz marketplace optimization, dropshipping.',
      icon: 'TrendingUp',
      isPopular: true
    },
    {
      name: 'Graphic Design & Brand Identity',
      category: 'Design & Creative',
      description: 'Vector logo design in Adobe Illustrator, brand guideline books, visual identity.',
      icon: 'Palette',
      isPopular: true
    },
    {
      name: 'English for Freelancers & Upwork Proposals',
      category: 'Language & Arts',
      description: 'Professional client communication, winning Upwork cover letters, confident spoken English.',
      icon: 'MessageSquare',
      isPopular: true
    },
    {
      name: 'Video Editing & Motion Graphics',
      category: 'Design & Creative',
      description: 'Premiere Pro, DaVinci Resolve color grading, After Effects keyframing for YouTube and reels.',
      icon: 'Video',
      isPopular: true
    },
    {
      name: 'Financial Modeling & Freelance Accounting',
      category: 'Business & Freelancing',
      description: 'Excel pro formulas, cash flow forecasting, budgeting for agencies and Pakistani tax basics.',
      icon: 'BarChart',
      isPopular: false
    },
    {
      name: 'Cyber Security & Ethical Hacking',
      category: 'Software & Tech',
      description: 'Network penetration testing, Linux command line, vulnerability assessment, OWASP Top 10.',
      icon: 'Shield',
      isPopular: false
    },
    {
      name: 'SEO & Technical Content Writing',
      category: 'Business & Freelancing',
      description: 'Keyword research, on-page SEO, backlink outreach, high-converting blog posts.',
      icon: 'Search',
      isPopular: true
    }
  ];

  const createdSkills = [];
  for (const s of skillsData) {
    const created = await Skill.create(s);
    createdSkills.push(created);
  }

  // Skill lookup map
  const sMap = {};
  createdSkills.forEach(s => {
    sMap[s.name] = s._id;
  });

  const salt = await bcrypt.genSalt(10);
  const commonPassword = await bcrypt.hash('SwapPass123!', salt);
  const adminPassword = await bcrypt.hash('AdminPass123!', salt);

  // 2. Create Users
  const usersData = [
    {
      name: 'Ali Khan',
      email: 'ali.khan@skillswap.pk',
      password: commonPassword,
      role: 'user',
      headline: 'Senior Full-Stack MERN Architect & Tech Mentor',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      city: 'Karachi',
      learningMode: 'Both',
      bio: 'Full-stack software engineer based in Clifton, Karachi with 5+ years of building production apps. Eager to learn Urdu calligraphy and refine design aesthetics!',
      teaching: [
        { skill: sMap['Full-Stack React & Node.js'], level: 'Expert', experienceYears: 5, description: 'React 18, Next.js, Express, MongoDB, Redux Toolkit.' },
        { skill: sMap['Python & Machine Learning'], level: 'Intermediate', experienceYears: 2, description: 'Data scripting, FastAPI, basic PyTorch pipelines.' }
      ],
      learning: [
        { skill: sMap['Urdu Calligraphy (Khat-e-Nastaliq)'], priority: 'High', notes: 'Want to study Nastaliq geometry and ink composition.' },
        { skill: sMap['Figma UI/UX & Design Systems'], priority: 'High', notes: 'Looking to master design token systems and auto-layout.' }
      ]
    },
    {
      name: 'Fatima Noor',
      email: 'fatima.noor@skillswap.pk',
      password: commonPassword,
      role: 'user',
      headline: 'Lead Product & UI/UX Designer @ Gulberg Tech',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      city: 'Lahore',
      learningMode: 'Online',
      bio: 'Passionate UX researcher and product designer in Gulberg, Lahore. Love clean typography and design systems. Wanting to learn full-stack code to ship solo MVPs!',
      teaching: [
        { skill: sMap['Figma UI/UX & Design Systems'], level: 'Expert', experienceYears: 4, description: 'Design systems, prototyping, user journey mapping, usability testing.' },
        { skill: sMap['Graphic Design & Brand Identity'], level: 'Expert', experienceYears: 5, description: 'Logo creation, brand manuals, typography.' }
      ],
      learning: [
        { skill: sMap['Full-Stack React & Node.js'], priority: 'High', notes: 'Need hands-on help converting Figma designs into working React components.' },
        { skill: sMap['Flutter Mobile App Development'], priority: 'Medium', notes: 'Interested in cross-platform UI widgets.' }
      ]
    },
    {
      name: 'Zainab Ahmed',
      email: 'zainab.ahmed@skillswap.pk',
      password: commonPassword,
      role: 'user',
      headline: 'Traditional Calligrapher & Heritage Artist',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      city: 'Islamabad',
      learningMode: 'Both',
      bio: 'Classical calligraphy practitioner in Islamabad. I teach Khat-e-Nastaliq and traditional ink making. In exchange, I want to learn web development to build an online heritage gallery!',
      teaching: [
        { skill: sMap['Urdu Calligraphy (Khat-e-Nastaliq)'], level: 'Expert', experienceYears: 7, description: 'Authentic reed pen calligraphy, letters, compound word balance.' }
      ],
      learning: [
        { skill: sMap['Full-Stack React & Node.js'], priority: 'High', notes: 'Building a portfolio showcase for traditional Islamic arts.' },
        { skill: sMap['SEO & Technical Content Writing'], priority: 'Medium', notes: 'Reaching international collectors.' }
      ]
    },
    {
      name: 'Bilal Tariq',
      email: 'bilal.tariq@skillswap.pk',
      password: commonPassword,
      role: 'user',
      headline: 'AI & Data Science Researcher | FAST-NUCES Alum',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
      city: 'Rawalpindi',
      learningMode: 'Both',
      bio: 'Machine learning specialist working on LLM fine-tuning and computer vision models. Looking to barter ML coaching for high-end video editing and motion graphics.',
      teaching: [
        { skill: sMap['Python & Machine Learning'], level: 'Expert', experienceYears: 4, description: 'Deep learning, transformers, LangChain, computer vision.' }
      ],
      learning: [
        { skill: sMap['Video Editing & Motion Graphics'], priority: 'High', notes: 'Producing YouTube educational breakdowns.' },
        { skill: sMap['Figma UI/UX & Design Systems'], priority: 'Medium', notes: 'Design dashboard wireframes for ML outputs.' }
      ]
    },
    {
      name: 'Ayesha Siddiqui',
      email: 'ayesha.siddiqui@skillswap.pk',
      password: commonPassword,
      role: 'user',
      headline: 'Upwork Top Rated Coach & Freelance English Specialist',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
      city: 'Karachi',
      learningMode: 'Online',
      bio: 'Trained over 200 Pakistani freelancers to pitch international clients with clarity and confidence. Seeking to learn e-commerce performance marketing!',
      teaching: [
        { skill: sMap['English for Freelancers & Upwork Proposals'], level: 'Expert', experienceYears: 6, description: 'Winning proposals, client video interviews, negotiation.' }
      ],
      learning: [
        { skill: sMap['Digital Marketing & Daraz / Shopify E-Commerce'], priority: 'High', notes: 'Scaling a niche fashion brand on Shopify.' }
      ]
    },
    {
      name: 'Usman Ghani',
      email: 'admin@skillswap.pk',
      password: adminPassword,
      role: 'admin',
      headline: 'SkillSwap Pakistan System Administrator',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80',
      city: 'Islamabad',
      learningMode: 'Both',
      bio: 'Platform administrator supporting the peer-to-peer barter movement across Pakistan.',
      teaching: [
        { skill: sMap['Cyber Security & Ethical Hacking'], level: 'Expert', experienceYears: 8, description: 'App sec, cloud architectures, zero-trust.' }
      ],
      learning: [
        { skill: sMap['Urdu Calligraphy (Khat-e-Nastaliq)'], priority: 'Low', notes: 'Weekend hobby.' }
      ]
    }
  ];

  const createdUserMap = {};

  for (const u of usersData) {
    const userDoc = await User.create({
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
      headline: u.headline,
      avatar: u.avatar
    });

    createdUserMap[u.email] = userDoc;

    await Profile.create({
      user: userDoc._id,
      bio: u.bio,
      city: u.city,
      learningMode: u.learningMode,
      availability: 'Evenings & Weekends (PKT)',
      rating: 4.9,
      reviewCount: 7,
      completedSwapsCount: 3,
      teachingSkills: u.teaching,
      learningSkills: u.learning
    });
  }

  // 3. Create Sample Swap Agreements
  const ali = createdUserMap['ali.khan@skillswap.pk'];
  const fatima = createdUserMap['fatima.noor@skillswap.pk'];
  const zainab = createdUserMap['zainab.ahmed@skillswap.pk'];

  // Swap 1: Ali Khan & Fatima Noor (Active)
  const swap1 = await SwapAgreement.create({
    proposer: ali._id,
    recipient: fatima._id,
    offeredSkill: sMap['Full-Stack React & Node.js'],
    requestedSkill: sMap['Figma UI/UX & Design Systems'],
    durationWeeks: 4,
    sessionsPerWeek: 2,
    sessionDurationMinutes: 60,
    learningMode: 'Online',
    venue: 'Google Meet (meet.google.com/ssw-barter-01)',
    terms: 'Two sessions each week: 1 hour React coding + 1 hour design system critique. Zero commercial fee.',
    initialMessage: 'Salam Fatima! I saw your incredible Figma design work. I would love to teach you React state management and Node API integration in exchange for your UI/UX feedback on my side project.',
    status: 'Accepted',
    milestones: [
      { title: 'Milestone 1: Figma Auto-layout Masterclass & React Component Architecture', completed: true },
      { title: 'Milestone 2: Design Tokens & Tailwind Setup + State Management in React', completed: true },
      { title: 'Milestone 3: Interactive Prototyping & REST API Integration', completed: false },
      { title: 'Milestone 4: Final Portfolio Project Review & Usability Audit', completed: false }
    ]
  });

  // Swap 2: Zainab Ahmed & Ali Khan (Pending Proposal)
  const swap2 = await SwapAgreement.create({
    proposer: zainab._id,
    recipient: ali._id,
    offeredSkill: sMap['Urdu Calligraphy (Khat-e-Nastaliq)'],
    requestedSkill: sMap['Full-Stack React & Node.js'],
    durationWeeks: 6,
    sessionsPerWeek: 2,
    sessionDurationMinutes: 60,
    learningMode: 'Both',
    venue: 'Zoom & Physical Session at NIC Islamabad / F-7',
    terms: 'Weekly reed pen calligraphy lessons in exchange for step-by-step guidance setting up an e-gallery website.',
    initialMessage: 'Assalam-o-Alaikum Ali bhai! I saw your profile and your interest in Nastaliq calligraphy. I have practiced traditional penmanship for 7 years and would gladly teach you the nuances of Qalam strokes in return for React mentoring.',
    status: 'Pending',
    milestones: [
      { title: 'Milestone 1: Qalam Cutting, Ink Selection & Initial Nuqta Dot Rules', completed: false },
      { title: 'Milestone 2: Connecting Letters & React Layout Foundations', completed: false },
      { title: 'Milestone 3: Traditional Nastaliq Balance & Portfolio Website Showcase', completed: false }
    ]
  });

  // 4. Create Sample Conversations & Messages
  const conv1 = await Conversation.create({
    participants: [ali._id, fatima._id],
    swapAgreement: swap1._id,
    lastMessageAt: new Date()
  });

  const msg1 = await Message.create({
    conversation: conv1._id,
    sender: ali._id,
    content: 'Salam Fatima! Excited to start our swap this Saturday. Have you already set up Node.js on your laptop?',
    readBy: [ali._id, fatima._id]
  });

  const msg2 = await Message.create({
    conversation: conv1._id,
    sender: fatima._id,
    content: 'Walaikum Assalam Ali! Yes, installed Node v20 and VS Code. Looking forward to our first session on Figma tokens and React props!',
    readBy: [ali._id, fatima._id]
  });

  await Conversation.findByIdAndUpdate(conv1._id, { lastMessage: msg2._id });

  console.log('🎉 Seed data successfully initialized with Pakistani personas and barter agreements!');
}

export async function seedSampleReports() {
  const count = await Report.countDocuments();
  if (count > 0) return;

  console.log('📋 Seeding realistic baseline reports for Admin Dashboard...');

  const users = await User.find({});
  if (users.length === 0) return;

  const ali = users.find(u => u.email === 'ali.khan@skillswap.pk') || users[0];
  const fatima = users.find(u => u.email === 'fatima.noor@skillswap.pk') || users[1];
  const zainab = users.find(u => u.email === 'zainab.ahmed@skillswap.pk') || users[2];
  const bilal = users.find(u => u.email === 'bilal.tariq@skillswap.pk') || users[3];
  const admin = users.find(u => u.role === 'admin') || users[users.length - 1];

  // 1. Urgent Pending Report (Fraud/Payment Scam)
  await Report.create({
    reportId: 'REP-104829',
    reporter: ali._id,
    reportedUser: bilal ? bilal._id : null,
    category: 'Fraud or scam',
    reason: 'Member demanded cash tuition fee of PKR 15,000 via JazzCash before starting lessons, violating SkillSwap zero-tuition community barter policy.',
    priority: 'Urgent',
    status: 'Pending',
    adminNotes: [],
    history: [
      {
        action: 'Report Submitted',
        actor: ali._id,
        actorName: ali.name,
        details: 'Report filed with Urgent priority under "Fraud or scam".',
        timestamp: new Date(Date.now() - 45 * 60 * 1000)
      }
    ]
  });

  // 2. High Priority Under Review Report (Harassment)
  await Report.create({
    reportId: 'REP-104830',
    reporter: fatima._id,
    reportedUser: bilal ? bilal._id : null,
    category: 'Harassment or abusive behavior',
    reason: 'Partner used inappropriate language during a peer review call and repeatedly sent unsolicited messages late at night.',
    priority: 'High',
    status: 'Under Review',
    assignedAdmin: admin ? admin._id : null,
    adminNotes: [
      {
        note: 'Contacted reporter Fatima for session timestamp logs. Reviewing reported chat messages.',
        author: admin._id,
        authorName: admin.name,
        createdAt: new Date(Date.now() - 20 * 60 * 1000)
      }
    ],
    history: [
      {
        action: 'Report Submitted',
        actor: fatima._id,
        actorName: fatima.name,
        details: 'Report filed under "Harassment or abusive behavior".',
        timestamp: new Date(Date.now() - 3 * 3600 * 1000)
      },
      {
        action: 'Report Opened by Admin',
        actor: admin._id,
        actorName: admin.name,
        details: 'Opened by administrator Usman Ghani for review.',
        timestamp: new Date(Date.now() - 2 * 3600 * 1000)
      },
      {
        action: 'Status Changed to Under Review',
        actor: admin._id,
        actorName: admin.name,
        details: 'Status updated to Under Review for investigation.',
        timestamp: new Date(Date.now() - 2 * 3600 * 1000)
      },
      {
        action: 'Internal Note Added',
        actor: admin._id,
        actorName: admin.name,
        details: 'Note added: "Contacted reporter Fatima for session timestamp logs."',
        timestamp: new Date(Date.now() - 20 * 60 * 1000)
      }
    ]
  });

  // 3. Resolved Report (Spam / Commercial Ads)
  await Report.create({
    reportId: 'REP-104831',
    reporter: zainab._id,
    reportedUser: ali._id,
    category: 'Spam or unwanted content',
    reason: 'Repeated promotional links posted promoting an external commercial bootcamp.',
    priority: 'Medium',
    status: 'Resolved',
    assignedAdmin: admin ? admin._id : null,
    adminNotes: [
      {
        note: 'Sent formal advisory to user. External links were removed from public description.',
        author: admin._id,
        authorName: admin.name,
        createdAt: new Date(Date.now() - 10 * 3600 * 1000)
      }
    ],
    resolution: {
      actionTaken: 'Content Hidden & Warning Issued',
      details: 'Offending promotional content removed; user received warning and agreed to community barter standards.',
      resolvedBy: admin._id,
      resolvedAt: new Date(Date.now() - 8 * 3600 * 1000)
    },
    history: [
      {
        action: 'Report Submitted',
        actor: zainab._id,
        actorName: zainab.name,
        details: 'Report filed under "Spam or unwanted content".',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000)
      },
      {
        action: 'Status Changed to Resolved',
        actor: admin._id,
        actorName: admin.name,
        details: 'Report resolved with Action: Content Hidden & Warning Issued.',
        timestamp: new Date(Date.now() - 8 * 3600 * 1000)
      }
    ]
  });

  // 4. Rejected Report (False or misleading info)
  await Report.create({
    reportId: 'REP-104832',
    reporter: ali._id,
    reportedUser: fatima._id,
    category: 'False or misleading information',
    reason: 'Subjective syllabus disagreement regarding whether Next.js App Router should precede Pages Router in introductory lessons.',
    priority: 'Low',
    status: 'Rejected',
    rejectionReason: 'Curriculum preference difference between barter partners is not a violation of platform guidelines.',
    adminNotes: [],
    history: [
      {
        action: 'Report Submitted',
        actor: ali._id,
        actorName: ali.name,
        details: 'Report filed under "False or misleading information".',
        timestamp: new Date(Date.now() - 48 * 3600 * 1000)
      },
      {
        action: 'Status Changed to Rejected',
        actor: admin._id,
        actorName: admin.name,
        details: 'Report rejected: Curriculum preference difference is not a violation.',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000)
      }
    ]
  });

  // Seed sample initial audit log
  await AuditLog.create({
    adminId: admin._id,
    adminName: admin.name,
    adminEmail: admin.email,
    action: 'SYSTEM_INITIALIZATION',
    targetType: 'System',
    targetId: 'CONFIG',
    details: 'SkillSwap Moderation System and Admin Dashboard initialized with policy compliance rules.',
    ipAddress: '127.0.0.1',
    createdAt: new Date(Date.now() - 48 * 3600 * 1000)
  });

  console.log('✅ Baseline reports successfully seeded.');
}
