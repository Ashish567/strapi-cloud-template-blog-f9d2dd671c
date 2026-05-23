'use strict';

const PUBLIC_READ_APIS = [
  'blog',
  'course',
  'faq',
  'home-page',
  'learning-path',
  'partner',
  'team-member',
  'testimonial',
  'category',
];

const seed = {
  categories: [
    { name: 'Artificial Intelligence', slug: 'artificial-intelligence', icon: '🤖', count: 42, color: '#1D4ED8' },
    { name: 'Web Development', slug: 'web-development', icon: '💻', count: 96, color: '#059669' },
  ],
  courses: [
    {
      title: 'Complete AI & Machine Learning Bootcamp',
      slug: 'complete-ai-machine-learning-bootcamp',
      shortDescription: 'Master AI, ML, deep learning, and neural networks from scratch.',
      description: 'Hands-on AI bootcamp with projects and career guidance.',
      instructor: 'Dr. Priya Sharma',
      thumbnail: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
      rating: 4.9,
      students: 12840,
      price: 2999,
      originalPrice: 7999,
      level: 'Intermediate',
      duration: '42 hours',
      badge: 'Bestseller',
      badgeColor: '#FBBF24',
      tags: ['Python', 'TensorFlow', 'Keras'],
      lessons: 186,
      certificate: true,
      categorySlug: 'artificial-intelligence',
    },
    {
      title: 'Full Stack Web Development 2026',
      slug: 'full-stack-web-development-2026',
      shortDescription: 'Build complete web applications with modern tooling.',
      description: 'Frontend + backend project-based full stack training.',
      instructor: 'Anjali Kapoor',
      thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80',
      rating: 4.8,
      students: 24560,
      price: 1999,
      originalPrice: 5999,
      level: 'Beginner',
      duration: '56 hours',
      badge: 'Bestseller',
      badgeColor: '#FBBF24',
      tags: ['React', 'Node.js', 'MongoDB'],
      lessons: 224,
      certificate: true,
      categorySlug: 'web-development',
    },
  ],
  testimonials: [
    {
      name: 'Aditya Kumar',
      role: 'AI Engineer at Google',
      content: 'The AI bootcamp was practical and helped me transition into industry quickly.',
      rating: 5,
      course: 'Complete AI & Machine Learning Bootcamp',
      avatar: 'AK',
    },
    {
      name: 'Priya Nair',
      role: 'Full Stack Developer at Flipkart',
      content: 'The full stack path gave me the confidence to ship production-ready apps.',
      rating: 5,
      course: 'Full Stack Web Development 2026',
      avatar: 'PN',
    },
  ],
  faqs: [
    {
      question: 'How do I access course materials after purchasing?',
      answer: 'You get instant lifetime access from your student dashboard.',
    },
    {
      question: 'Do I receive a certificate?',
      answer: 'Yes, every completed course includes a shareable certificate.',
    },
  ],
  partners: [
    { companyName: 'Google' },
    { companyName: 'Microsoft' },
    { companyName: 'Amazon' },
  ],
  learningPaths: [
    {
      title: 'AI Engineer',
      description: 'From Python basics to production ML systems.',
      courses: 8,
      duration: '6 months',
      icon: '🤖',
      color: '#1D4ED8',
      steps: ['Python Fundamentals', 'Math for ML', 'ML Algorithms', 'Deep Learning', 'MLOps'],
    },
    {
      title: 'Full Stack Developer',
      description: 'From frontend foundations to backend deployment.',
      courses: 10,
      duration: '8 months',
      icon: '💻',
      color: '#059669',
      steps: ['HTML/CSS', 'JavaScript', 'React', 'Node.js', 'Database Design', 'Deployment'],
    },
  ],
  blogs: [
    {
      title: 'How to Start in AI in 2026',
      slug: 'how-to-start-in-ai-in-2026',
      excerpt: 'A practical roadmap to launch your AI career this year.',
      content: 'Start with Python, then core ML, then projects and deployment.',
      category: 'Artificial Intelligence',
      author: 'ChetnaVerse Team',
      readTime: '6 min read',
      emoji: '🤖',
      color: '#1D4ED8',
    },
  ],
  teamMembers: [
    {
      name: 'Chetna Sharma',
      designation: 'Founder & Lead Instructor',
      bio: 'EdTech leader focused on practical upskilling and mentorship.',
      bg: '#1D4ED8',
    },
    {
      name: 'Rahul Verma',
      designation: 'Curriculum Director',
      bio: 'Designs project-first learning pathways for tech careers.',
      bg: '#059669',
    },
  ],
  homePage: {
    hero: {
      eyebrow: "India's #1 Tech Education Platform",
      title: 'Build. Code. Innovate.',
      subtitle:
        'Master AI, Robotics, and Coding with world-class instructors. Join 1.2M+ learners building the future.',
    },
  },
};

async function ensurePublicReadPermissions() {
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });

  if (!publicRole) return;

  for (const apiName of PUBLIC_READ_APIS) {
    for (const action of ['find', 'findOne']) {
      const actionName = `api::${apiName}.${apiName}.${action}`;
      const existing = await strapi.query('plugin::users-permissions.permission').findOne({
        where: {
          action: actionName,
          role: publicRole.id,
        },
      });

      if (!existing) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            action: actionName,
            role: publicRole.id,
          },
        });
      }
    }
  }
}

async function findBy(uid, where) {
  return strapi.db.query(uid).findOne({ where });
}

async function createIfMissing(uid, where, data, options = {}) {
  const existing = await findBy(uid, where);
  if (existing) {
    if (options.status === 'published' && !existing.publishedAt) {
      await strapi.documents(uid).publish({ documentId: existing.documentId });
      return findBy(uid, where);
    }
    return existing;
  }

  await strapi.documents(uid).create({
    data,
    ...options,
  });

  return findBy(uid, where);
}

async function upsertHomePage() {
  const uid = 'api::home-page.home-page';
  const existing = await strapi.db.query(uid).findOne({ where: {} });

  if (existing) {
    await strapi.documents(uid).update({
      documentId: existing.documentId,
      data: seed.homePage,
    });
    return;
  }

  await strapi.documents(uid).create({ data: seed.homePage });
}

async function seedCategories() {
  const uid = 'api::category.category';
  for (const category of seed.categories) {
    await createIfMissing(uid, { slug: category.slug }, category);
  }
}

async function seedCourses() {
  const uid = 'api::course.course';
  const categoryUid = 'api::category.category';

  for (const course of seed.courses) {
    const category = await findBy(categoryUid, { slug: course.categorySlug });
    const { categorySlug, ...courseData } = course;

    await createIfMissing(uid, { slug: course.slug }, {
      ...courseData,
      category: category ? category.documentId : null,
    }, {
      status: 'published',
    });
  }
}

async function seedTestimonials() {
  const uid = 'api::testimonial.testimonial';
  for (const item of seed.testimonials) {
    await createIfMissing(uid, { name: item.name, course: item.course }, item);
  }
}

async function seedFaqs() {
  const uid = 'api::faq.faq';
  for (const item of seed.faqs) {
    await createIfMissing(uid, { question: item.question }, item);
  }
}

async function seedPartners() {
  const uid = 'api::partner.partner';
  for (const item of seed.partners) {
    await createIfMissing(uid, { companyName: item.companyName }, item);
  }
}

async function seedLearningPaths() {
  const uid = 'api::learning-path.learning-path';
  for (const item of seed.learningPaths) {
    await createIfMissing(uid, { title: item.title }, item);
  }
}

async function seedBlogs() {
  const uid = 'api::blog.blog';
  for (const item of seed.blogs) {
    await createIfMissing(uid, { slug: item.slug }, item, { status: 'published' });
  }
}

async function seedTeamMembers() {
  const uid = 'api::team-member.team-member';
  for (const item of seed.teamMembers) {
    await createIfMissing(uid, { name: item.name }, item);
  }
}

async function run() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = 'error';

  try {
    await ensurePublicReadPermissions();
    await seedCategories();
    await seedCourses();
    await seedTestimonials();
    await seedFaqs();
    await seedPartners();
    await seedLearningPaths();
    await seedBlogs();
    await seedTeamMembers();
    await upsertHomePage();
    console.log('E-learning schema permissions and seed data are ready.');
  } finally {
    await app.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
