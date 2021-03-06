/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var extend = require('extend');
var pick = require('object.pick');
var isStream = require('isstream');
var requestFactory = require('../lib/requestwrapper');
var util = require('util');
var BaseServiceAlchemy = require('../lib/base_service_alchemy');

var NEGATIVE_EXAMPLES = 'negative_examples';

/**
 * JS-style logical XOR - works on objects, booleans, strings, etc following normal js truthy/falsy conventions
 * @private
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 * @constructor
 */
function xor(a, b) {
  return ( a || b ) && !( a && b );
}

/**
 * Verifies that a stream images_file or a string url is included
 * also gracefully handles cases of image_file instead of images_file
 *
 * @private
 */
function verifyParams(params) {
  if (params && params.image_file && !params.images_file) {
    params.images_file = params.image_file;
  }

  if (!params || !xor(params.images_file, params.url)) {
    throw new Error('Watson VisualRecognition.classify() requires either an images_file or a url parameter');
  }

  if (params.images_file && !isStream(params.images_file)) {
    throw new Error('images_file param must be a standard Node.js Stream');
  }
}

/**
 * Formats error
 *
 * @private
 */
function errorFormatter(cb) {
  var callback = typeof cb === 'function' ? cb : function() { /* no op */};
  return function(err, result) {
    if (err) {
      callback(err, result);
    } else {
      if (result.status === 'ERROR') {
        if (result.statusInfo === 'invalid-api-key') {
          callback({
            error: result.statusInfo,
            code: result.statusInfo === 'invalid-api-key' ? 401 : 400
          }, null);
        }
      } else {
        callback(err, result);
      }
    }
  };
}

/**
 *
 * @param options
 * @constructor
 */
function VisualRecognitionV3(options) {
  BaseServiceAlchemy.call(this, options);
  // Check if 'version_date' was provided
  if (typeof this._options.version_date === 'undefined') {
    throw new Error('Argument error: version_date was not specified, use 2016-05-19');
  }
  //this._options.qs.api_key = this._options.api_key;
  this._options.qs.version = this._options.version_date; // todo: confirm service expects version not version_date
}
util.inherits(VisualRecognitionV3, BaseServiceAlchemy);
VisualRecognitionV3.prototype.name = 'visual_recognition';
VisualRecognitionV3.prototype.version = 'v3';
VisualRecognitionV3.URL = 'http://gateway-a.watsonplatform.net/visual-recognition/api';
VisualRecognitionV3.prototype.serviceDefaults = {
  alchemy: true
};

/**
 * Bluemix uses a different naming convention for VR v3 than for other services
 * @returns {*}
 */
VisualRecognitionV3.prototype.getCredentialsFromBluemix = function() {
  return BaseServiceAlchemy.prototype.getCredentialsFromBluemix.call(this, 'watson_vision_combined');
};

/**
 * Pulls api_key from VISUAL_RECOGNITION_API_KEY env property
 *
 * @returns {{api_key: String|undefined}}
 */
VisualRecognitionV3.prototype.getCredentialsFromEnvironment = function() {
  return {
    api_key: process.env.VISUAL_RECOGNITION_API_KEY
  }
};

/**
 * Accepts either a url, a single image file, or a zip file with multiple
 * images (.jpeg, .png, .gif) and scores every available classifier
 * on each image. It then applies a threshold and returns the list
 * of relevant classifier scores for each image.
 *
 * @example
 * * {
 *   "images": [{
 *     "classifiers": [{
 *       "classes": [{
 *         "class": "animal",
 *         "score": 0.998771,
 *         "type_hierarchy": "/animals"
 *       }, {
 *         "class": "mammal",
 *         "score": 0.998499,
 *         "type_hierarchy": "/animals/mammal"
 *       }, {
 *         "class": "dog",
 *         "score": 0.900249,
 *         "type_hierarchy": "/animals/pets/dog"
 *       }, {
 *         "class": "puppy",
 *         "score": 0.5,
 *         "type_hierarchy": "/animals/pets/puppy"
 *       }],
 *       "classifier_id": "default",
 *       "name": "default"
 *     }],
 *     "image": "dog.jpg"
 *   }],
 *   "images_processed": 1
 * }
 *
 * @param {Object} params
 * @param {ReadStream} [params.images_file] The image file (.jpg, .png, .gif) or compressed (.zip) file of images to classify. The total number of images is limited to 100. Either images_file or url must be specified.
 * @param {String} [params.url] The URL of an image (.jpg, .png, .gif). Redirects are followed, so you can use shortened URLs. The resolved URL is returned in the response. Either images_file or url must be specified.
 * @param {Array} [params.classifier_ids=['default']] An array of classifier IDs to classify the images against.
 * @param {Array} [params.owners=['me','IBM']] An array with the value(s) "IBM" and/or "me" to specify which classifiers to run.
 * @param {Number} [params.threshold] A floating point value that specifies the minimum score a class must have to be displayed in the response.
 * @param {Function} callback
 *
 * @returns {ReadableStream|undefined}
 *
 */
VisualRecognitionV3.prototype.classify = function(params, callback) {

  try {
    verifyParams(params);
  } catch (e) {
    callback(e);
    return;
  }

  params = extend({
    classifier_ids: ['default'],
    owners: ['me','IBM']
  }, params);

  var parameters;

  if(params.images_file) {
    parameters = {
      options: {
        url: '/v3/classify',
        method: 'POST',
        formData: {
          images_file: params.images_file,
          parameters: {
            value: JSON.stringify(pick(params, ['classifier_ids', 'owners', 'threshold'])),
            options: {
              contentType: 'application/json'
            }
          }
        },
        headers: pick(params, 'Accept-Language')
      },
      defaultOptions: this._options
    };
  } else {
    parameters = {
      options: {
        url: '/v3/classify',
        method: 'GET',
        json: true,
        qs: pick(params, ['url', 'classifier_ids', 'owners', 'threshold']),
        headers: pick(params, 'Accept-Language')
      },
      defaultOptions: this._options
    };
  }

  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Accepts either a url, a single image file, or a zip file with multiple
 * images (.jpeg, .png, .gif) and attempts to extract faces and
 * identities. It then applies a threshold
 * and returns the list of relevant identities, locations, and metadata
 * for found faces for each image.
 *
 * @example
 * {
 *   "images": [{
 *     "faces": [{
 *       "age": {
 *         "max": 54,
 *         "min": 45,
 *         "score": 0.40459
 *       },
 *       "face_location": {
 *         "height": 131,
 *         "left": 80,
 *         "top": 68,
 *         "width": 123
 *       },
 *       "gender": {
 *         "gender": "MALE",
 *         "score": 0.993307
 *       },
 *       "identity": {
 *         "name": "Barack Obama",
 *         "score": 0.970688,
 *         "type_hierarchy": "/people/politicians/democrats/barack obama"
 *       }
 *     }],
 *     "image": "obama.jpg"
 *   }],
 *   "images_processed": 1
 * }
 *
 * @param {Object} params
 * @param {ReadStream} [params.images_file] The image file (.jpg, .png, .gif) or compressed (.zip) file of images to classify. The total number of images is limited to 100. Either images_file or url must be specified.
 * @param {String} [params.url] The URL of an image (.jpg, .png, .gif). Redirects are followed, so you can use shortened URLs. The resolved URL is returned in the response. Either images_file or url must be specified.
 * @param {Function} callback
 *
 * @returns {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.detectFaces = function(params, callback) {
  try {
    verifyParams(params);
  } catch (e) {
    callback(e);
    return;
  }

  var parameters;

  if(params.images_file) {
    parameters = {
      options: {
        url: '/v3/detect_faces',
        method: 'POST',
        json: true,
        formData: pick(params, ['images_file'])
      },
      defaultOptions: this._options
    };

  } else {
    parameters = {
      options: {
        url: '/v3/detect_faces',
        method: 'GET',
        json: true,
        qs: pick(params, ['url'])
      },
      defaultOptions: this._options
    };
  }

  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Accepts either a url, single image file, or a zip file with multiple
 * images (.jpeg, .png, .gif) and attempts to recognize text
 * found in the image. It then applies a threshold
 * and returns the list of relevant locations, strings,  and metadata
 * for discovered text in each image.
 *
 * @example
 * {
 *   "images": [{
 *     "image": "car.png",
 *     "text": "3 jag [brio]",
 *     "words": [{
 *       "line_number": 0,
 *       "location": {
 *         "height": 53,
 *         "left": 204,
 *         "top": 294,
 *         "width": 27
 *       },
 *       "score": 0.50612,
 *       "word": "3"
 *     }, {
 *       "line_number": 0,
 *       "location": {
 *         "height": 32,
 *         "left": 264,
 *         "top": 288,
 *         "width": 56
 *       },
 *       "score": 0.958628,
 *       "word": "jag"
 *     }, {
 *       "line_number": 0,
 *       "location": {
 *         "height": 40,
 *         "left": 324,
 *         "top": 288,
 *         "width": 92
 *       },
 *       "score": 0.00165806,
 *       "word": "brio"
 *     }]
 *   }],
 *   "images_processed": 1
 * }
 *
 * @param {Object} params
 * @param {ReadStream} [params.images_file] The image file (.jpg, .png, .gif) or compressed (.zip) file of images to classify. The total number of images is limited to 100. Either images_file or url must be specified.
 * @param {String} [params.url] The URL of an image (.jpg, .png, .gif). Redirects are followed, so you can use shortened URLs. The resolved URL is returned in the response. Either images_file or url must be specified.
 * @param {Function} callback
 *
 * @returns {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.recognizeText = function(params, callback) {
  try {
    verifyParams(params);
  } catch (e) {
    callback(e);
    return;
  }

  var parameters;

  if(params.images_file) {
    parameters = {
      options: {
        url: '/v3/recognize_text',
        method: 'POST',
        json: true,
        formData: pick(params, ['images_file'])
      },
      defaultOptions: this._options
    };
  } else {
    parameters = {
      options: {
        url: '/v3/recognize_text',
        method: 'GET',
        json: true,
        qs: pick(params, ['url'])
      },
      defaultOptions: this._options
    };
  }

  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Train a new classifier from example images which are uploaded.
 * This call returns before training has completed.  You'll need to use the
 * getClassifer method to make sure the classifier has completed training and
 * was successful before you can classify any images with the newly created
 * classifier.
 *
 * @example
 * {
 *   foo_positive_examples: fs.createReadStream('./foo-pics.zip'),
 *   negative_examples: fs.createReadStream('./not-foo-pics.zip'),
 *   name: 'to-foo-or-not'
 * }
 * @example
 * {
 *  foo_positive_examples: fs.createReadStream('./foo-pics.zip'),
 *  bar_positive_examples: fs.createReadStream('./bar-pics.zip'),
 *  name: 'foo-vs-bar'
 * }
 * @example
 * {
 *  foo_positive_examples: fs.createReadStream('./foo-pics.zip'),
 *  bar_positive_examples: fs.createReadStream('./bar-pics.zip'),
 *  negative_examples: fs.createReadStream('./not-foo-pics.zip'),
 *  name: 'foo-bar-not'
 * }
 *
 * @example
 * {
 *   "classifier_id": "fruit_679357912",
 *   "name": "fruit",
 *   "owner": "a3a48ea7-492b-448b-87d7-9dade8bde5a9",
 *   "status": "training",
 *   "created": "2016-05-23T21:50:41.680Z",
 *   "classes": [{
 *     "class": "banana"
 *   }, {
 *     "class": "apple"
 *   }]
 * }
 *
 * @param {Object} params
 * @param {String} params.name The desired short name of the new classifier.
 * @param {ReadStream} params.classname_positive_examples <your_class_name>_positive_examples One or more compressed (.zip) files of images that depict the visual subject for a class within the new classifier. Must contain a minimum of 10 images. You may supply multiple files with different class names in the key.
 * @param {ReadStream} [params.negative_examples] A compressed (.zip) file of images that do not depict the visual subject of any of the classes of the new classifier. Must contain a minimum of 10 images. Required if only one positive set is provided.
 *
 * @returns {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.createClassifier = function(params, callback) {
  params = params || {};

  var example_keys = Object.keys(params).filter(function(key) {
    return key === NEGATIVE_EXAMPLES || key.match(/^.+_positive_examples$/);
  });

  if (example_keys.length < 2) {
    callback(new Error('Missing required parameters: either two *_positive_examples or one *_positive_examples and one negative_examples must be provided.'));
    return;
  }
  // todo: validate that all *_examples are streams or else objects with buffers and content-types
  var allowed_keys = ['name', NEGATIVE_EXAMPLES].concat(example_keys);

  var parameters = {
    options: {
      url: '/v3/classifiers',
      method: 'POST',
      json: true,
      formData: pick(params, allowed_keys)
    },
    requiredParams: ['name'],
    defaultOptions: this._options
  };
  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Retrieve a list of all classifiers, including built-in and
 * user-created classifiers.
 *
 * @example
 * {
 *   "classifiers": [{
 *     "classifier_id": "fruit_679357912",
 *     "name": "fruit",
 *     "status": "ready"
 *   }, {
 *     "classifier_id": "Dogs_2017013066",
 *     "name": "Dogs",
 *     "status": "ready"
 *   }]
 * }
 *
 * @param {Object} params
 * @param {Boolean} [params.verbose=false]
 * @param {Function} callback
 * @return {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.listClassifiers = function(params, callback) {
  var parameters = {
    options: {
      method: 'GET',
      url: '/v3/classifiers',
      qs: pick(params, ['verbose']),
      json: true,
    },
    defaultOptions: this._options
  };
  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Retrieves information about a specific classifier.
 *
 * @example
 * {
 *   "classifier_id": "fruit_679357912",
 *   "name": "fruit",
 *   "owner": "a3a42ea7-492b-448b-87d7-9dfde8bde519 ",
 *   "status": "ready",
 *   "created": "2016-05-23T21:50:41.680Z",
 *   "classes": [{
 *     "class": "banana"
 *   }, {
 *     "class": "apple"
 *   }]
 * }
 *
 * @param {Object} params
 * @param {Boolean} params.classifier_id The classifier id
 * @param {Function} callback
 * @return {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.getClassifier = function(params, callback) {
  var parameters = {
    options: {
      method: 'GET',
      url: '/v3/classifiers/{classifier_id}',
      path: params,
      json: true
    },
    requiredParams: ['classifier_id'],
    defaultOptions: this._options
  };
  return requestFactory(parameters, errorFormatter(callback));
};

/**
 * Deletes a custom classifier with the specified classifier id.
 *
 * @param {Object} params
 * @param {String} params.classifier_id The classifier id
 * @param {Function} callback
 * @returns {ReadableStream|undefined}
 */
VisualRecognitionV3.prototype.deleteClassifier = function(params, callback) {
  var parameters = {
    options: {
      method: 'DELETE',
      url: '/v3/classifiers/{classifier_id}',
      path: params,
      json: true,
    },
    requiredParams: ['classifier_id'],
    defaultOptions: this._options
  };
  return requestFactory(parameters, errorFormatter(callback));
};

module.exports = VisualRecognitionV3;
