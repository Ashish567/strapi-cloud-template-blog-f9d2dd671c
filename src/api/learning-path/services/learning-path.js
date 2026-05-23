'use strict';

/**
 * learning-path service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::learning-path.learning-path');