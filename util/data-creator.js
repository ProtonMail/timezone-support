const { mkdir, writeFile } = require('fs/promises')
const { dirname } = require('path')
const moment = require('moment-timezone')
const tz = require('moment-timezone/moment-timezone-utils').tz
// The time zone data come from the installed "moment-timezone" package. Updating
// the time zone database means updating the version of this dependency.
const packedTimeZoneData = require('moment-timezone/data/packed/latest.json')

// Groups of aliases (links) with the same data, led by the canonical zone name
function getGroupLeaders (packedData) {
  const groups = {}
  packedData.links.forEach(link => {
    const [leader, alias] = link.split('|');
    (groups[leader] = groups[leader] || [leader]).push(alias)
  })
  return groups
}

// Zones with the full history, which the year-limited data are cut from
function getUnpackedData (packedData) {
  moment.tz.load(packedData)
  return {
    version: packedData.version,
    zones: moment.tz.names().map(name => {
      const { abbrs, untils, offsets, population } = moment.tz.zone(name)
      // Infinity is not representable in JSON, it is stored as null
      return { name, abbrs, untils: untils.map(until => isFinite(until) ? until : null), offsets, population }
    }),
    links: [],
    countries: packedData.countries.map(country => {
      const [name, zones] = country.split('|')
      return { name, zones: zones.split(' ') }
    })
  }
}

const groupLeaders = getGroupLeaders(packedTimeZoneData)
const unpackedTimeZoneData = getUnpackedData(packedTimeZoneData)

function limitData (firstYear, lastYear) {
  return firstYear && lastYear
    ? tz.filterLinkPack(unpackedTimeZoneData, firstYear, lastYear, groupLeaders)
    : packedTimeZoneData
}

function formatES6Module (content) {
  return `export default ${content}`
}

function formatCJSModule (content) {
  return `module.exports = ${content}`
}

function formatAMDModule (content) {
  return `define(function () {
  return ${content}
})`
}

function formatUMDModule (content, umdName) {
  return `(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  factory(global.${umdName || 'timezoneData'} = {})
} (this, (function (exports) {
  Object.assign(exports, ${content})
  Object.defineProperty(exports, '__esModule', { value: true })
})))`
}

async function createTimeZoneData (options = {}) {
  const {
    asModule, asCjsModule, asAmdModule, asUmdModule, umdName,
    firstYear, lastYear, outputFile
  } = options
  const data = limitData(firstYear, lastYear)
  let content = JSON.stringify(data, undefined, 2)
  if (asModule) {
    content = formatES6Module(content)
  } else if (asCjsModule) {
    content = formatCJSModule(content)
  } else if (asAmdModule) {
    content = formatAMDModule(content)
  } else if (asUmdModule) {
    content = formatUMDModule(content, umdName)
  }
  if (outputFile) {
    if (firstYear && lastYear) {
      console.log(`Writing time zone data for ${firstYear}-${lastYear} to "${outputFile}"...`)
    } else {
      console.log(`Writing all time zone data to "${outputFile}"...`)
    }
    const outputDir = dirname(outputFile)
    if (outputDir !== '.') await mkdir(outputDir, { recursive: true })
    await writeFile(outputFile, content)
  }
  return content
}

exports.createTimeZoneData = createTimeZoneData
