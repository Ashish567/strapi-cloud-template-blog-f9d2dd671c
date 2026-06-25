'use strict';

const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const { categories, authors, articles, global, about } = require('../data/data.json');

async function seedExampleApp() {
  const shouldImportSeedData = await isFirstRun();

  if (shouldImportSeedData) {
    try {
      console.log('Setting up the template...');
      await importSeedData();
      console.log('Ready to go');
    } catch (error) {
      console.log('Could not import seed data');
      console.error(error);
    }
  } else {
    console.log(
      'Seed data has already been imported. We cannot reimport unless you clear your database first.'
    );
  }
}

async function isFirstRun() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: 'type',
    name: 'setup',
  });
  const initHasRun = await pluginStore.get({ key: 'initHasRun' });
  await pluginStore.set({ key: 'initHasRun', value: true });
  return !initHasRun;
}

async function setPublicPermissions(newPermissions) {
  // Find the ID of the public role
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: {
      type: 'public',
    },
  });

  // Create the new permissions and link them to the public role
  const allPermissionsToCreate = [];
  Object.keys(newPermissions).map((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) => {
      return strapi.query('plugin::users-permissions.permission').create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      });
    });
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
}

function getFileSizeInBytes(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats['size'];
  return fileSizeInBytes;
}

function getFileData(fileName) {
  const filePath = path.join('data', 'uploads', fileName);
  // Parse the file metadata
  const size = getFileSizeInBytes(filePath);
  const ext = fileName.split('.').pop();
  const mimeType = mime.lookup(ext || '') || '';

  return {
    filepath: filePath,
    originalFileName: fileName,
    size,
    mimetype: mimeType,
  };
}

async function uploadFile(file, name) {
  return strapi
    .plugin('upload')
    .service('upload')
    .upload({
      files: file,
      data: {
        fileInfo: {
          alternativeText: `An image uploaded to Strapi called ${name}`,
          caption: name,
          name,
        },
      },
    });
}

// Create an entry and attach files if there are any
async function createEntry({ model, entry }) {
  try {
    // Actually create the entry in Strapi
    await strapi.documents(`api::${model}.${model}`).create({
      data: entry,
    });
  } catch (error) {
    console.error({ model, entry, error });
  }
}

async function checkFileExistsBeforeUpload(files) {
  const existingFiles = [];
  const uploadedFiles = [];
  const filesCopy = [...files];

  for (const fileName of filesCopy) {
    // Check if the file already exists in Strapi
    const fileWhereName = await strapi.query('plugin::upload.file').findOne({
      where: {
        name: fileName.replace(/\..*$/, ''),
      },
    });

    if (fileWhereName) {
      // File exists, don't upload it
      existingFiles.push(fileWhereName);
    } else {
      // File doesn't exist, upload it
      const fileData = getFileData(fileName);
      const fileNameNoExtension = fileName.split('.').shift();
      const [file] = await uploadFile(fileData, fileNameNoExtension);
      uploadedFiles.push(file);
    }
  }
  const allFiles = [...existingFiles, ...uploadedFiles];
  // If only one file then return only that file
  return allFiles.length === 1 ? allFiles[0] : allFiles;
}

async function updateBlocks(blocks) {
  const updatedBlocks = [];
  for (const block of blocks) {
    if (block.__component === 'shared.media') {
      const uploadedFiles = await checkFileExistsBeforeUpload([block.file]);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file name on the block with the actual file
      blockCopy.file = uploadedFiles;
      updatedBlocks.push(blockCopy);
    } else if (block.__component === 'shared.slider') {
      // Get files already uploaded to Strapi or upload new files
      const existingAndUploadedFiles = await checkFileExistsBeforeUpload(block.files);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file names on the block with the actual files
      blockCopy.files = existingAndUploadedFiles;
      // Push the updated block
      updatedBlocks.push(blockCopy);
    } else {
      // Just push the block as is
      updatedBlocks.push(block);
    }
  }

  return updatedBlocks;
}

async function importArticles() {
  for (const article of articles) {
    const cover = await checkFileExistsBeforeUpload([`${article.slug}.jpg`]);
    const updatedBlocks = await updateBlocks(article.blocks);

    await createEntry({
      model: 'article',
      entry: {
        ...article,
        cover,
        blocks: updatedBlocks,
        // Make sure it's not a draft
        publishedAt: Date.now(),
      },
    });
  }
}

async function importGlobal() {
  const favicon = await checkFileExistsBeforeUpload(['favicon.png']);
  const shareImage = await checkFileExistsBeforeUpload(['default-image.png']);
  return createEntry({
    model: 'global',
    entry: {
      ...global,
      favicon,
      // Make sure it's not a draft
      publishedAt: Date.now(),
      defaultSeo: {
        ...global.defaultSeo,
        shareImage,
      },
    },
  });
}

async function importAbout() {
  const updatedBlocks = await updateBlocks(about.blocks);

  await createEntry({
    model: 'about',
    entry: {
      ...about,
      blocks: updatedBlocks,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importCategories() {
  for (const category of categories) {
    await createEntry({ model: 'category', entry: category });
  }
}

async function importAuthors() {
  for (const author of authors) {
    const avatar = await checkFileExistsBeforeUpload([author.avatar]);

    await createEntry({
      model: 'author',
      entry: {
        ...author,
        avatar,
      },
    });
  }
}

async function importSeedData() {
  // Allow read of application content types
  await setPublicPermissions({
    article: ['find', 'findOne'],
    category: ['find', 'findOne'],
    author: ['find', 'findOne'],
    global: ['find', 'findOne'],
    about: ['find', 'findOne'],
  });

  // Create all entries
  await importCategories();
  await importAuthors();
  await importArticles();
  await importGlobal();
  await importAbout();
}

async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = 'error';

  await seedExampleApp();
  await app.destroy();

  process.exit(0);
}


async function ensureAllPublicPermissions() {
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: {
      type: 'public',
    },
  });

  if (!publicRole) return;

  const apis = [
    'about',
    'article',
    'author',
    'blog',
    'category',
    'course',
    'faq',
    'global',
    'home-page',
    'learning-path',
    'partner',
    'team-member',
    'testimonial',
    'module',
    'lesson',
  ];

  const actions = ['find', 'findOne'];

  for (const apiName of apis) {
    for (const action of actions) {
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

const sampleCurriculum = [
  {
    title: 'Module 1: Introduction & Setup',
    lessons: [
      { title: 'Welcome to the Course', type: 'video', bunnyVideoId: 'sample-video-1', durationSeconds: 300 },
      { title: 'Environment Setup', type: 'video', bunnyVideoId: 'sample-video-2', durationSeconds: 600 },
      { title: 'Your First Program', type: 'video', bunnyVideoId: 'sample-video-3', durationSeconds: 900 },
      { title: 'Quiz: Basics', type: 'quiz', bunnyVideoId: '', durationSeconds: 0 },
    ]
  },
  {
    title: 'Module 2: Core Concepts',
    lessons: [
      { title: 'Data Types & Variables', type: 'video', bunnyVideoId: 'sample-video-4', durationSeconds: 800 },
      { title: 'Control Structures', type: 'video', bunnyVideoId: 'sample-video-5', durationSeconds: 1000 },
      { title: 'Functions & Modules', type: 'video', bunnyVideoId: 'sample-video-6', durationSeconds: 1200 },
      { title: 'Practical Project', type: 'video', bunnyVideoId: 'sample-video-7', durationSeconds: 1500 },
    ]
  },
  {
    title: 'Module 3: Advanced Topics',
    lessons: [
      { title: 'OOP Principles', type: 'video', bunnyVideoId: 'sample-video-8', durationSeconds: 1400 },
      { title: 'Libraries & Frameworks', type: 'video', bunnyVideoId: 'sample-video-9', durationSeconds: 1600 },
      { title: 'Real-world Applications', type: 'video', bunnyVideoId: 'sample-video-10', durationSeconds: 1800 },
      { title: 'Final Assignment', type: 'text', bunnyVideoId: '', durationSeconds: 0 },
    ]
  },
  {
    title: 'Module 4: Projects & Deployment',
    lessons: [
      { title: 'Capstone Project Brief', type: 'video', bunnyVideoId: 'sample-video-11', durationSeconds: 900 },
      { title: 'Building the Project', type: 'video', bunnyVideoId: 'sample-video-12', durationSeconds: 2400 },
      { title: 'Testing & Debugging', type: 'video', bunnyVideoId: 'sample-video-13', durationSeconds: 1500 },
      { title: 'Deployment', type: 'video', bunnyVideoId: 'sample-video-14', durationSeconds: 800 },
    ]
  }
];

async function seedCurriculumForCourse(courseDocId) {
  let moduleOrder = 1;
  for (const m of sampleCurriculum) {
    const module = await strapi.documents('api::module.module').create({
      data: {
        title: m.title,
        order: moduleOrder++,
        course: courseDocId,
        publishedAt: new Date()
      },
      status: 'published'
    });

    let lessonOrder = 1;
    for (const l of m.lessons) {
      await strapi.documents('api::lesson.lesson').create({
        data: {
          title: l.title,
          order: lessonOrder++,
          type: l.type,
          bunnyVideoId: l.bunnyVideoId,
          durationSeconds: l.durationSeconds,
          module: module.documentId,
          publishedAt: new Date()
        },
        status: 'published'
      });
    }
  }
}

async function ensureDataSeeded() {
  try {
    // 0. Publish existing drafts if any
    const draftCourses = await strapi.documents('api::course.course').findMany({
      status: 'draft',
      limit: 100,
    });
    if (draftCourses && draftCourses.length > 0) {
      console.log(`Publishing ${draftCourses.length} draft courses...`);
      for (const draft of draftCourses) {
        await strapi.documents('api::course.course').publish({
          documentId: draft.documentId,
        });
      }
    }

    const draftBlogs = await strapi.documents('api::blog.blog').findMany({
      status: 'draft',
      limit: 100,
    });
    if (draftBlogs && draftBlogs.length > 0) {
      console.log(`Publishing ${draftBlogs.length} draft blogs...`);
      for (const draft of draftBlogs) {
        await strapi.documents('api::blog.blog').publish({
          documentId: draft.documentId,
        });
      }
    }

    const draftHomePages = await strapi.documents('api::home-page.home-page').findMany({
      status: 'draft',
      limit: 10,
    });
    if (draftHomePages && draftHomePages.length > 0) {
      console.log(`Publishing ${draftHomePages.length} draft home pages...`);
      for (const draft of draftHomePages) {
        await strapi.documents('api::home-page.home-page').publish({
          documentId: draft.documentId,
        });
      }
    }

    const courses = await strapi.documents('api::course.course').findMany({
      limit: 1,
    });
    if (courses && courses.length > 0) {
      console.log('Database already has course entries, checking/seeding modules...');
      const allCourses = await strapi.documents('api::course.course').findMany({
        populate: ['modules'],
        limit: 100,
      });
      for (const course of allCourses) {
        if (!course.slug) {
          let computedSlug = course.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          if (computedSlug.includes('ai-machine-learning')) {
            computedSlug = 'ai-machine-learning-bootcamp';
          } else if (computedSlug.includes('robotics-engineering')) {
            computedSlug = 'robotics-engineering';
          } else if (computedSlug.includes('full-stack-web-development')) {
            computedSlug = 'full-stack-web-development';
          }
          console.log(`Course "${course.title}" has null slug. Updating to "${computedSlug}"`);
          await strapi.documents('api::course.course').update({
            documentId: course.documentId,
            data: { slug: computedSlug }
          });
        }

        if (!course.modules || course.modules.length === 0) {
          console.log(`Course "${course.title}" has no modules. Seeding curriculum...`);
          await seedCurriculumForCourse(course.documentId);
        }
      }
      return;
    }

    console.log('Seeding learning platform data from strapi-import/data...');

    const importDir = path.join(__dirname, '../data/seed');
    if (!await fs.exists(importDir)) {
      console.log(`Import directory ${importDir} not found.`);
      return;
    }

    // 1. Categories
    const categoryMap = new Map();
    const categoriesPath = path.join(importDir, 'categories.json');
    if (await fs.exists(categoriesPath)) {
      const cats = await fs.readJson(categoriesPath);
      for (const cat of cats) {
        const dbCats = await strapi.documents('api::category.category').findMany({
          filters: { name: cat.name },
          limit: 1,
        });
        let dbCat = dbCats[0];
        if (!dbCat) {
          dbCat = await strapi.documents('api::category.category').create({
            data: {
              name: cat.name,
              icon: cat.icon,
              count: cat.count,
              color: cat.color,
              slug: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
              publishedAt: new Date()
            }
          });
        }
        categoryMap.set(cat.name, dbCat.documentId);
      }
    }

    // 2. Courses
    const coursesPath = path.join(importDir, 'courses.json');
    if (await fs.exists(coursesPath)) {
      const coursesList = await fs.readJson(coursesPath);
      for (const course of coursesList) {
        const catDocId = categoryMap.get(course.category);
        let computedSlug = course.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (computedSlug.includes('ai-machine-learning')) {
          computedSlug = 'ai-machine-learning-bootcamp';
        } else if (computedSlug.includes('robotics-engineering')) {
          computedSlug = 'robotics-engineering';
        } else if (computedSlug.includes('full-stack-web-development')) {
          computedSlug = 'full-stack-web-development';
        }
        const newCourse = await strapi.documents('api::course.course').create({
          data: {
            title: course.title,
            slug: computedSlug,
            instructor: course.instructor,
            thumbnail: course.thumbnail,
            rating: course.rating,
            students: course.students,
            price: course.price,
            originalPrice: course.originalPrice,
            level: course.difficulty,
            duration: course.duration,
            badge: course.badge,
            badgeColor: course.badgeColor,
            tags: course.tags,
            lessons: course.lessons,
            certificate: course.certificate,
            shortDescription: course.description,
            description: course.description,
            category: catDocId,
            publishedAt: new Date()
          },
          status: 'published'
        });
        await seedCurriculumForCourse(newCourse.documentId);
      }
    }

    // 3. Blogs
    const blogsPath = path.join(importDir, 'blogs.json');
    if (await fs.exists(blogsPath)) {
      const blogs = await fs.readJson(blogsPath);
      for (const blog of blogs) {
        await strapi.documents('api::blog.blog').create({
          data: {
            title: blog.title,
            excerpt: blog.excerpt,
            category: blog.category,
            author: blog.author,
            readTime: blog.readTime,
            emoji: blog.emoji,
            color: blog.color,
            publishedAt: new Date()
          },
          status: 'published'
        });
      }
    }

    // 4. FAQs
    const faqsPath = path.join(importDir, 'faqs.json');
    if (await fs.exists(faqsPath)) {
      const faqs = await fs.readJson(faqsPath);
      for (const faq of faqs) {
        await strapi.documents('api::faq.faq').create({
          data: {
            question: faq.question,
            answer: faq.answer,
            publishedAt: new Date()
          }
        });
      }
    }

    // 5. Learning Paths
    const lpPath = path.join(importDir, 'learning-paths.json');
    if (await fs.exists(lpPath)) {
      const lps = await fs.readJson(lpPath);
      for (const lp of lps) {
        await strapi.documents('api::learning-path.learning-path').create({
          data: {
            title: lp.title,
            description: lp.description,
            courses: lp.courses,
            duration: lp.duration,
            icon: lp.icon,
            color: lp.color,
            steps: lp.steps,
            publishedAt: new Date()
          }
        });
      }
    }

    // 6. Partners
    const partnersPath = path.join(importDir, 'partners.json');
    if (await fs.exists(partnersPath)) {
      const partners = await fs.readJson(partnersPath);
      for (const partner of partners) {
        await strapi.documents('api::partner.partner').create({
          data: {
            companyName: partner.companyName,
            publishedAt: new Date()
          }
        });
      }
    }

    // 7. Team Members
    const teamPath = path.join(importDir, 'team-members.json');
    if (await fs.exists(teamPath)) {
      const teams = await fs.readJson(teamPath);
      for (const team of teams) {
        await strapi.documents('api::team-member.team-member').create({
          data: {
            name: team.name,
            designation: team.designation,
            bg: team.bg,
            bio: team.bio,
            publishedAt: new Date()
          }
        });
      }
    }

    // 8. Testimonials
    const testimonialsPath = path.join(importDir, 'testimonials.json');
    if (await fs.exists(testimonialsPath)) {
      const testimonials = await fs.readJson(testimonialsPath);
      for (const test of testimonials) {
        await strapi.documents('api::testimonial.testimonial').create({
          data: {
            name: test.name,
            role: test.role,
            review: test.review,
            rating: test.rating,
            course: test.course,
            publishedAt: new Date()
          }
        });
      }
    }

    // 9. Pages (Home Page)
    const pagesPath = path.join(importDir, 'pages.json');
    if (await fs.exists(pagesPath)) {
      const pages = await fs.readJson(pagesPath);
      for (const page of pages) {
        if (page.type === 'home-page') {
          const existings = await strapi.documents('api::home-page.home-page').findMany({
            limit: 1,
          });
          const existing = existings[0];
          if (!existing) {
            await strapi.documents('api::home-page.home-page').create({
              data: {
                hero: page.hero,
                publishedAt: new Date()
              },
              status: 'published'
            });
          }
        }
      }
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error in ensureDataSeeded seeder:', error);
  }
}

module.exports = async () => {
  await seedExampleApp();
  await ensureAllPublicPermissions();
  await ensureDataSeeded();
};
