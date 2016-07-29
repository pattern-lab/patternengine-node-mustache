/*
 * mustache pattern engine for patternlab-node - v2.X.X - 2016
 *
 * Geoffrey Pursell, Brian Muenzenmeyer, and the web community.
 * Licensed under the MIT license.
 *
 * Many thanks to Brad Frost and Dave Olsen for inspiration, encouragement, and advice.
 *
 */

/*
 * ENGINE SUPPORT LEVEL:
 *
 * Full + extensions. Partial calls and lineage hunting are supported. Style
 * modifiers and pattern parameters are used to extend the core feature set of
 * Mustache templates.
 *
 */

"use strict";

var Hogan = require('hogan.js');
var JSON5 = require('json5');
var utilMustache = require('./util_mustache');

var engine_mustache = {
  engine: Hogan,
  engineName: 'hogan',
  engineFileExtension: '.mustache',

  // partial expansion is only necessary for Mustache templates that have
  // style modifiers or pattern parameters (I think)
  expandPartials: true,

  // regexes, stored here so they're only compiled once
  findPartialsRE: utilMustache.partialsRE,
  findPartialsWithStyleModifiersRE: utilMustache.partialsWithStyleModifiersRE,
  findPartialsWithPatternParametersRE: utilMustache.partialsWithPatternParametersRE,
  findListItemsRE: utilMustache.listItemsRE,
  findPartialRE: utilMustache.partialRE,

  // render it
  renderPattern: function renderPattern(pattern, data, partials) {
    var toRender;

    if (typeof pattern === 'string') {
      toRender = pattern;
    } else if (typeof pattern.extendedTemplate === 'string') {
      toRender = pattern.extendedTemplate;
    } else {
      debugger;
      console.log("e = renderPattern() requires a string or a pattern object as its first argument!");
    }

    try {
      var compiled = Hogan.compile(toRender);

      if (partials) {
        return compiled.render(data, partials);
      }
      return compiled.render(data);
    } catch (e) {
      debugger;
      console.log("e = ", e);
    }
    return undefined;
  },

  /**
   * Find regex matches within both pattern strings and pattern objects.
   *
   * @param {string|object} pattern Either a string or a pattern object.
   * @param {object} regex A JavaScript RegExp object.
   * @returns {array|null} An array if a match is found, null if not.
   */
  patternMatcher: function patternMatcher(pattern, regex) {
    var matches;
    if (typeof pattern === 'string') {
      matches = pattern.match(regex);
    } else if (typeof pattern === 'object' && typeof pattern.extendedTemplate === 'string') {
      matches = pattern.extendedTemplate.match(regex);
    }
    return matches;
  },

  // find and return any {{> template-name }} within pattern
  findPartials: function findPartials(pattern) {
    var matches = this.patternMatcher(pattern, this.findPartialsRE);
    return matches;
  },
  findPartialsWithStyleModifiers: function (pattern) {
    var matches = this.patternMatcher(pattern, this.findPartialsWithStyleModifiersRE);
    return matches;
  },

  // returns any patterns that match {{> value(foo:"bar") }} or {{>
  // value:mod(foo:"bar") }} within the pattern
  findPartialsWithPatternParameters: function (pattern) {
    var matches = this.patternMatcher(pattern, this.findPartialsWithPatternParametersRE);
    return matches;
  },
  findListItems: function (pattern) {
    var matches = this.patternMatcher(pattern, this.findListItemsRE);
    return matches;
  },

  // given a pattern, and a partial string, tease out the "pattern key" and
  // return it.
  findPartial_new: function (partialString) {
    var partial = partialString.replace(this.findPartialRE, '$1');
    return partial;
  },

  // GTP: the old implementation works better. We might not need
  // this.findPartialRE anymore if it works in all cases!
  findPartial: function (partialString) {
    //strip out the template cruft
    var foundPatternPartial = partialString.replace("{{> ", "").replace(" }}", "").replace("{{>", "").replace("}}", "");

    // remove any potential pattern parameters. this and the above are rather brutish but I didn't want to do a regex at the time
    if (foundPatternPartial.indexOf('(') > 0) {
      foundPatternPartial = foundPatternPartial.substring(0, foundPatternPartial.indexOf('('));
    }

    //remove any potential stylemodifiers.
    foundPatternPartial = foundPatternPartial.split(':')[0];

    return foundPatternPartial;
  },

  registerPartial: function (pattern, patternlab) {
    var exports = module.exports;
    var i;
    var j;
    var leftParen;
    var rightParen;
    var paramString;
    var params;
    var partial;
    var partials = exports.findPartials(pattern);
    var registered;

    if (!partials) {
      return;
    }

    for (i = 0; i < partials.length; i++) {
      params = null;
      partial = partials[i];

      registered = false;

      for (j in patternlab.partials) {
        if (patternlab.partials.hasOwnProperty(j)) {
          if (j === partial) {
            registered = true;
            break;
          }
        }
      }

      if (!registered) {
        // identify and save params submitted with this partial
        leftParen = partial.indexOf('(');
        if (leftParen > -1) {
          rightParen = partial.lastIndexOf(')');
          paramString = '{' + partial.substring(leftParen + 1, rightParen) + '}';
          try {
            params = JSON5.parse(utilMustache.paramToJson(paramString));
          } catch (err) {
            console.error(err);
          }
        }

        patternlab.partials[partial] = {
          partial: exports.findPartial(partial),
          params: params,
          content: ''
        };
      }
    }
  },

  preprocessPartials: function (pattern_assembler, patternlab) {
    var escapedKey;
    var escapedPartial;
    var i;
    var j;
    var pa = pattern_assembler;
    var partials = patternlab.partials;
    var regex;

    for (i in partials) {
      if (partials.hasOwnProperty(i)) {
        // escape the parametered tags within partials by changing delimiters to unicodes
        // for start-of-text and end-of-text
        escapedPartial = pa.findPartial(partials[i].partial, patternlab).extendedTemplate;
        escapedPartial = '{{=\u0002 \u0003=}}' + escapedPartial;

        for (j in partials[i].params) {
          if (partials[i].params.hasOwnProperty(j)) {
            escapedKey = utilMustache.escapeReservedRegexChars(j);
            regex = new RegExp('\\{\\{(\\S?\\s*' + escapedKey + ')', 'g');
            escapedPartial = escapedPartial.replace(regex, '\u0002$1');
            regex = new RegExp('(' + escapedKey + '\\s*)\\}?\\}\\}', 'g');
            escapedPartial = escapedPartial.replace(regex, '$1\u0003');
          }
        }

        partials[i].content = this.renderPattern(escapedPartial, partials[i].params);
      }
    }
  }
};

module.exports = engine_mustache;
