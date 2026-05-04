package com.dartlsp

object Analyzer {
    fun analyze(code: String): List<Diagnostic> {
        val diagnostics = mutableListOf<Diagnostic>()
        val lines = code.split("\n")

        // a) Syntax errors: unmatched braces/parentheses.
        var openBraces = 0
        var openParens = 0
        for ((index, line) in lines.withIndex()) {
            for ((col, char) in line.withIndex()) {
                when (char) {
                    '{' -> openBraces++
                    '}' -> {
                        openBraces--
                        if (openBraces < 0) {
                            diagnostics.add(Diagnostic(index + 1, col + 1, "Unmatched closing brace '}'", "ERROR"))
                            openBraces = 0
                        }
                    }
                    '(' -> openParens++
                    ')' -> {
                        openParens--
                        if (openParens < 0) {
                            diagnostics.add(Diagnostic(index + 1, col + 1, "Unmatched closing parenthesis ')'", "ERROR"))
                            openParens = 0
                        }
                    }
                }
            }
        }
        if (openBraces > 0) {
            diagnostics.add(Diagnostic(lines.size, lines.last().length + 1, "Missing closing brace '}'", "ERROR"))
        }
        if (openParens > 0) {
            diagnostics.add(Diagnostic(lines.size, lines.last().length + 1, "Missing closing parenthesis ')'", "ERROR"))
        }

        val declaredVariables = mutableSetOf<String>()
        val usedVariables = mutableSetOf<String>()
        val knownTypes = setOf("int", "String", "double", "bool", "var", "final", "const", "dynamic", "void")

        val declarationRegex = Regex("""(?:int|String|double|bool|var|final|const|dynamic)\s+([a-zA-Z_]\w*)\s*(?:=|;)""")
        val wordRegex = Regex("""\b([a-zA-Z_]\w*)\b""")
        val stringTypeMismatchRegex = Regex("""int\s+[a-zA-Z_]\w*\s*=\s*".*"""")
        
        for ((index, line) in lines.withIndex()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("//")) continue

            // b) Missing semicolons
            if ((trimmed.contains("=") || trimmed.contains("(")) && 
                !trimmed.endsWith(";") && !trimmed.endsWith("{") && !trimmed.endsWith("}")) {
                diagnostics.add(Diagnostic(index + 1, line.length, "Missing semicolon", "ERROR"))
            }

            // Variable Declarations
            val declMatch = declarationRegex.find(line)
            if (declMatch != null) {
                declaredVariables.add(declMatch.groupValues[1])
            }

            // Word Usages
            val lineWithoutStrings = line.replace(Regex("\".*?\""), "").replace(Regex("'.*?'"), "")
            val words = wordRegex.findAll(lineWithoutStrings).map { it.groupValues[1] }.toList()
            for (word in words) {
                if (word !in knownTypes && word !in setOf("main", "print", "true", "false", "if", "else", "for", "while", "return", "class", "void")) {
                    usedVariables.add(word)
                }
            }

            // e) Type mismatches
            if (stringTypeMismatchRegex.containsMatchIn(line)) {
                diagnostics.add(Diagnostic(index + 1, 1, "Type mismatch: String assigned to int", "ERROR"))
            }
        }

        // c) Unused variables
        for (variable in declaredVariables) {
            val occurrences = wordRegex.findAll(code).filter { it.groupValues[1] == variable }.count()
            if (occurrences <= 1) {
                val lineIndex = lines.indexOfFirst { it.contains(variable) }
                diagnostics.add(Diagnostic(lineIndex + 1, 1, "Unused variable: $variable", "WARNING"))
            }
        }

        // d) Undefined references
        for (variable in usedVariables) {
            if (variable !in declaredVariables) {
                val lineIndex = lines.indexOfFirst { line ->
                    val noStrings = line.replace(Regex("\".*?\""), "").replace(Regex("'.*?'"), "")
                    wordRegex.findAll(noStrings).any { match -> match.groupValues[1] == variable } 
                }
                if (lineIndex != -1 && !declarationRegex.containsMatchIn(lines[lineIndex])) {
                    diagnostics.add(Diagnostic(lineIndex + 1, 1, "Undefined reference: $variable", "ERROR"))
                }
            }
        }

        return diagnostics
    }
}
