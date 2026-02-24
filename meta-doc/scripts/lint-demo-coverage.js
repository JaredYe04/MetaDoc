#!/usr/bin/env node

/**
 * Demo Coverage Linting Script
 *
 * Enforces demo coverage requirements for manual documentation files.
 *
 * Formula: required_demos = max(ceil((h1_count + h2_count + h3_count) / 3), 2)
 *
 * Usage: node scripts/lint-demo-coverage.js
 */

const fs = require('fs')
const path = require('path')

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

// Regex patterns
const HEADING_PATTERN = /^#{1,3}\s+/gm
const H1_PATTERN = /^#\s+/gm
const H2_PATTERN = /^##\s+/gm
const H3_PATTERN = /^###\s+/gm
const DEMO_PATTERN = /\b[A-Z][A-Za-z0-9_]*\s+mode=["']demo["']/g
const EXEMPT_PATTERN = /<!--\s*demo-exempt:\s*(.+?)\s*-->/
const COMPONENT_NAME_PATTERN = /\b([A-Z][A-Za-z0-9_]*)\s+mode=["']demo["']/
const YAML_FRONTMATTER_PATTERN = /^---\s*\n[\s\S]*?\n---\s*\n/

/**
 * Strip YAML frontmatter from content
 */
function stripFrontmatter(content) {
  return content.replace(YAML_FRONTMATTER_PATTERN, '')
}

/**
 * Check if file has exemption comment
 */
function getExemptionReason(content) {
  const match = content.match(EXEMPT_PATTERN)
  return match ? match[1].trim() : null
}

/**
 * Count headings in content
 */
function countHeadings(content) {
  const h1Matches = content.match(H1_PATTERN) || []
  const h2Matches = content.match(H2_PATTERN) || []
  const h3Matches = content.match(H3_PATTERN) || []

  return {
    h1: h1Matches.length,
    h2: h2Matches.length,
    h3: h3Matches.length,
    total: h1Matches.length + h2Matches.length + h3Matches.length
  }
}

/**
 * Find all demo components in content
 */
function findDemos(content) {
  const demos = []
  const matches = content.matchAll(DEMO_PATTERN)

  for (const match of matches) {
    const componentMatch = match[0].match(COMPONENT_NAME_PATTERN)
    if (componentMatch) {
      demos.push(componentMatch[1])
    }
  }

  return demos
}

/**
 * Calculate required demos based on heading count
 */
function calculateRequiredDemos(headingCount) {
  return Math.max(Math.ceil(headingCount / 3), 2)
}

/**
 * Generate suggestions for missing demos
 */
function generateSuggestions(demos, missing) {
  const suggestions = []

  // Common demo component patterns based on file content context
  const commonDemos = [
    'MenuItemsDemo',
    'Demo',
    'SettingsDemo',
    'FeatureDemo',
    'EditorDemo',
    'ChatDemo',
    'AgentDemo',
    'WorkflowDemo',
    'ChartDemo',
    'OutlineDemo',
    'KnowledgeBaseDemo',
    'ExportDemo',
    'ImportDemo',
    'ThemeDemo',
    'LLMConfigDemo'
  ]

  // Use existing demos as templates for suggestions
  const uniqueDemos = [...new Set(demos)]

  if (uniqueDemos.length > 0) {
    // Suggest more of what they already use
    for (let i = 0; i < missing && i < uniqueDemos.length; i++) {
      suggestions.push(`<${uniqueDemos[i % uniqueDemos.length]} mode="demo" />`)
    }
  } else {
    // Suggest common demos
    for (let i = 0; i < missing && i < commonDemos.length; i++) {
      suggestions.push(`<${commonDemos[i]} mode="demo" />`)
    }
  }

  return suggestions
}

/**
 * Find all .md files recursively in directory
 */
function findMarkdownFiles(dir) {
  const files = []

  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        traverse(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  if (fs.existsSync(dir)) {
    traverse(dir)
  }

  return files.sort()
}

/**
 * Analyze a single file
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const contentWithoutFrontmatter = stripFrontmatter(content)

  const headings = countHeadings(contentWithoutFrontmatter)
  const demos = findDemos(contentWithoutFrontmatter)
  const exemptionReason = getExemptionReason(content)

  const required = calculateRequiredDemos(headings.total)
  const actual = demos.length
  const missing = Math.max(0, required - actual)

  return {
    filePath,
    headings,
    demos,
    required,
    actual,
    missing,
    exemptionReason,
    pass: actual >= required || exemptionReason !== null
  }
}

/**
 * Format relative path for display
 */
function formatRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath).replace(/\\/g, '/')
}

/**
 * Print colored output
 */
function print(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`)
}

/**
 * Print report header
 */
function printHeader(fileCount) {
  console.log('')
  print(`📊 Demo Coverage Report (${fileCount} files)`, 'bright')
  print('===================================', 'cyan')
  console.log('')
}

/**
 * Print file result
 */
function printFileResult(result, baseDir) {
  const relativePath = formatRelativePath(result.filePath, baseDir)

  if (result.pass) {
    if (result.exemptionReason) {
      print(`⏭️  EXEMPT: ${relativePath}`, 'yellow')
      print(`   Reason: ${result.exemptionReason}`, 'cyan')
    } else {
      print(`✅ PASS: ${relativePath}`, 'green')
    }
  } else {
    print(`❌ FAIL: ${relativePath}`, 'red')
  }

  print(
    `   Headings: ${result.headings.total} (H1:${result.headings.h1}, H2:${result.headings.h2}, H3:${result.headings.h3}) | Required: ${result.required} | Actual: ${result.actual}`,
    'cyan'
  )

  if (!result.pass && !result.exemptionReason) {
    print(`   Missing: ${result.missing} demos`, 'red')

    const suggestions = generateSuggestions(result.demos, result.missing)
    if (suggestions.length > 0) {
      print(`   Suggested: Add ${suggestions.join(', ')}`, 'yellow')
    }
  }

  console.log('')
}

/**
 * Print summary
 */
function printSummary(results) {
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = total - passed
  const exempt = results.filter((r) => r.exemptionReason).length
  const totalDemos = results.reduce((sum, r) => sum + r.actual, 0)
  const totalMissing = results.reduce((sum, r) => sum + (r.exemptionReason ? 0 : r.missing), 0)

  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  console.log('')
  print('📈 Summary:', 'bright')
  print(`   Total files: ${total}`, 'cyan')
  print(`   Passed: ${passed - exempt}`, 'green')
  print(`   Exempt: ${exempt}`, 'yellow')
  print(`   Failed: ${failed}`, 'red')
  print(`   Pass rate: ${passRate}%`, passRate >= 80 ? 'green' : passRate >= 50 ? 'yellow' : 'red')
  print(`   Total demos: ${totalDemos}`, 'cyan')
  if (totalMissing > 0) {
    print(`   Total missing: ${totalMissing}`, 'red')
  }
  console.log('')

  return { passed, failed, total }
}

/**
 * Main function
 */
function main() {
  const manualsDir = path.join(__dirname, '..', 'src', 'renderer', 'src', 'manuals', 'zh_CN')

  // Check if directory exists
  if (!fs.existsSync(manualsDir)) {
    print(`❌ Error: Manuals directory not found: ${manualsDir}`, 'red')
    process.exit(1)
  }

  // Find all markdown files
  const files = findMarkdownFiles(manualsDir)

  if (files.length === 0) {
    print(`⚠️  No markdown files found in: ${manualsDir}`, 'yellow')
    process.exit(0)
  }

  // Analyze all files
  const results = files.map(analyzeFile)

  // Print report
  printHeader(files.length)

  for (const result of results) {
    printFileResult(result, manualsDir)
  }

  // Print summary
  const { failed } = printSummary(results)

  // Exit with appropriate code
  if (failed > 0) {
    print('❌ Demo coverage check FAILED', 'red')
    print(
      '   Please add the required demo components or add <!-- demo-exempt: reason -->',
      'yellow'
    )
    process.exit(1)
  } else {
    print('✅ All files pass demo coverage requirements!', 'green')
    process.exit(0)
  }
}

// Run main
main()
