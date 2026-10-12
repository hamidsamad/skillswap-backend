import { Skill } from '../config/db.js';

export const IT_SKILL_CATEGORIES = [
  {
    category: 'Software & Web Development',
    skills: [
      'Full-Stack Web Development (MERN Stack)',
      'Frontend Development (React.js & Next.js)',
      'Backend Engineering (Node.js & Express)',
      'Python Full-Stack & Django / FastAPI',
      'PHP & Laravel Web Development',
      'Java & Spring Boot Enterprise Development',
      'ASP.NET Core & C# Development',
      'Vue.js & Nuxt.js Frontend Development',
      'Angular Web App Development',
      'Ruby on Rails Development',
      'RESTful API & GraphQL Development',
      'TypeScript & Modern JavaScript'
    ]
  },
  {
    category: 'Mobile Application Development',
    skills: [
      'Flutter & Dart Cross-Platform Development',
      'React Native Mobile App Development',
      'Android App Development (Kotlin / Java)',
      'iOS App Development (Swift & SwiftUI)',
      'Mobile UI/UX & Responsive App Architecture',
      'Progressive Web Apps (PWA) Development'
    ]
  },
  {
    category: 'Cloud Computing & DevOps',
    skills: [
      'AWS Cloud Solutions Architecture',
      'Microsoft Azure Cloud Administration',
      'Google Cloud Platform (GCP) Engineering',
      'DevOps CI/CD Pipelines (GitHub Actions / Jenkins)',
      'Docker Containerization & Kubernetes (K8s)',
      'Infrastructure as Code (Terraform & Ansible)',
      'Linux System Administration (Ubuntu / RedHat)',
      'Serverless Architecture & Microservices'
    ]
  },
  {
    category: 'Cybersecurity & Ethical Hacking',
    skills: [
      'Ethical Hacking & Penetration Testing',
      'Network Security & Firewall Management',
      'SOC Analyst & Incident Response',
      'Web Application Security (OWASP Top 10)',
      'Vulnerability Assessment & VAPT',
      'Cryptography & Public Key Infrastructure (PKI)',
      'Information Security & ISO 27001 Compliance',
      'Cyber Forensics & Threat Hunting'
    ]
  },
  {
    category: 'Network Engineering & Infrastructure',
    skills: [
      'Cisco Networking (CCNA / CCNP Routing & Switching)',
      'Network Administration & Troubleshooting',
      'Computer Hardware & System Maintenance',
      'Windows Server & Active Directory Administration',
      'Wireless Networking & Subnetting',
      'IT Support Specialist & Helpdesk Administration (CompTIA A+)'
    ]
  },
  {
    category: 'Database Administration & Big Data',
    skills: [
      'SQL & Relational Database Design (MySQL / PostgreSQL)',
      'Microsoft SQL Server Administration (T-SQL)',
      'Oracle Database Administration (DBA)',
      'NoSQL Databases (MongoDB & Cassandra)',
      'Data Warehousing & ETL Pipelines (Snowflake / BigQuery)',
      'Big Data Engineering (Apache Spark / Hadoop)',
      'Redis Caching & In-Memory Data Storage'
    ]
  },
  {
    category: 'Data Science & Business Intelligence',
    skills: [
      'Data Analytics with Python (Pandas / NumPy)',
      'Business Intelligence & Dashboards (Power BI)',
      'Tableau Data Visualization & Reporting',
      'Statistical Analysis & R Programming',
      'Advanced Excel & Financial Modeling',
      'Exploratory Data Analysis (EDA) & Data Mining'
    ]
  },
  {
    category: 'UI/UX Design & Digital Products',
    skills: [
      'UI/UX Design & Prototyping (Figma / Adobe XD)',
      'Wireframing & User Journey Mapping',
      'Design Systems & Component Libraries',
      'Graphic Design for Digital Media (Photoshop / Illustrator)',
      'Product Management & Agile / Scrum Methodologies',
      'Usability Testing & User Research'
    ]
  },
  {
    category: 'Software Quality Assurance (QA) & Testing',
    skills: [
      'Manual Software Testing & Test Case Design',
      'Automated Testing (Selenium & Cypress)',
      'API Testing & Automation (Postman / RestAssured)',
      'Performance & Load Testing (JMeter)',
      'Mobile Automation Testing (Appium)',
      'Quality Assurance (QA) Management & Bug Tracking'
    ]
  },
  {
    category: 'CMS, E-Commerce & No-Code',
    skills: [
      'WordPress & Custom Theme / Plugin Development',
      'Shopify E-Commerce Store Development',
      'WooCommerce Customization & Integration',
      'Webflow & Framer Visual Web Development',
      'Workflow Automation (Zapier / Make.com)'
    ]
  },
  {
    category: 'Game Development & 3D Interactive Tech',
    skills: [
      'Unity 3D Game Development (C#)',
      'Unreal Engine Game Development (C++ & Blueprints)',
      '3D Modeling & Animation (Blender)',
      'AR/VR Interactive Experiences & Metaverse'
    ]
  }
];

export const TRENDING_SKILL_NAMES = new Set([
  'Full-Stack Web Development (MERN Stack)',
  'Full-Stack React & Node.js',
  'Frontend Development (React.js & Next.js)',
  'Python Full-Stack & Django / FastAPI',
  'Python & Machine Learning',
  'Flutter & Dart Cross-Platform Development',
  'Flutter Mobile App Development',
  'AWS Cloud Solutions Architecture',
  'Ethical Hacking & Penetration Testing',
  'UI/UX Design & Prototyping (Figma / Adobe XD)',
  'Figma UI/UX & Design Systems',
  'WordPress & Custom Theme / Plugin Development',
  'Business Intelligence & Dashboards (Power BI)',
  'Video Editing & Motion Graphics',
  'Urdu Calligraphy (Khat-e-Nastaliq)',
  'Digital Marketing & Daraz / Shopify E-Commerce'
]);

export async function syncITSkills() {
  console.log('🔄 Syncing comprehensive IT courses and skills to database...');
  let added = 0;
  for (const group of IT_SKILL_CATEGORIES) {
    for (const skillName of group.skills) {
      const isTrending = TRENDING_SKILL_NAMES.has(skillName);
      const existing = await Skill.findOne({ name: skillName });
      if (!existing) {
        await Skill.create({
          name: skillName,
          category: group.category,
          description: `${skillName} course and specialization in ${group.category}.`,
          icon: 'Code',
          isPopular: isTrending
        });
        added++;
      } else {
        let modified = false;
        if (existing.category !== group.category) {
          existing.category = group.category;
          modified = true;
        }
        if (existing.isPopular !== isTrending) {
          existing.isPopular = isTrending;
          modified = true;
        }
        if (modified) {
          if (typeof existing.save === 'function') {
            await existing.save();
          } else if (typeof Skill.findByIdAndUpdate === 'function') {
            await Skill.findByIdAndUpdate(existing._id, { category: existing.category, isPopular: existing.isPopular });
          }
        }
      }
    }
  }

  // Also synchronize any skills created outside IT_SKILL_CATEGORIES
  const allSkills = await Skill.find();
  for (const skill of allSkills) {
    const isTrending = TRENDING_SKILL_NAMES.has(skill.name);
    if (skill.isPopular !== isTrending) {
      skill.isPopular = isTrending;
      if (typeof skill.save === 'function') {
        await skill.save();
      } else if (typeof Skill.findByIdAndUpdate === 'function') {
        await Skill.findByIdAndUpdate(skill._id, { isPopular: isTrending });
      }
    }
  }

  const total = await Skill.countDocuments();
  const trendingCount = await Skill.countDocuments({ isPopular: true });
  console.log(`✅ IT skills sync complete! Added: ${added}, Total in DB: ${total}, Trending: ${trendingCount}`);
  return total;
}
