package com.dartlsp

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.http.content.*
import io.ktor.server.routing.*
import java.io.File

fun main() {
    val port = System.getenv("PORT")?.toInt() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Get)
    }

    install(ContentNegotiation) {
        json()
    }

    routing {
        staticFiles("/", File("frontend")) {
            default("index.html")
        }
        post("/analyze-code") {
            val request = call.receive<AnalyzeRequest>()
            val diagnostics = Analyzer.analyze(request.code)
            call.respond(AnalyzeResponse(diagnostics))
        }

        post("/completions") {
            val request = call.receive<CompletionRequest>()
            val completions = CompletionProvider.getCompletions(request.code, request.cursor)
            call.respond(CompletionResponse(completions))
        }

        post("/execute") {
            val request = call.receive<AnalyzeRequest>()
            
            // Check for syntax/compilation errors first
            val diagnostics = Analyzer.analyze(request.code)
            val errors = diagnostics.filter { it.severity == "ERROR" }
            if (errors.isNotEmpty()) {
                val errorOutput = StringBuilder("Execution failed: Compilation errors found!\n-------------------------------------------\n")
                errors.forEach { 
                    errorOutput.appendLine("Error at Line ${it.line}, Col ${it.column}: ${it.message}")
                }
                call.respond(ExecuteResponse(errorOutput.toString()))
                return@post
            }
            
            // Simulated execution: Extract print statements and basic variable assignments
            val lines = request.code.split("\n")
            val outputBuilder = StringBuilder()
            val printRegex = Regex("""print\((.*?)\);?""")
            val varAssignRegex = Regex("""(?:int|String|double|bool|var|dynamic)\s+([a-zA-Z_]\w*)\s*=\s*(.*?);""")
            val variables = mutableMapOf<String, String>()
            
            for (line in lines) {
                // Track variable assignments
                val varMatch = varAssignRegex.find(line)
                if (varMatch != null) {
                    val varName = varMatch.groupValues[1]
                    var varValue = varMatch.groupValues[2].trim()
                    if ((varValue.startsWith("\"") && varValue.endsWith("\"")) || (varValue.startsWith("'") && varValue.endsWith("'"))) {
                        varValue = varValue.substring(1, varValue.length - 1)
                    }
                    variables[varName] = varValue
                }

                // Handle print statements
                val match = printRegex.find(line)
                if (match != null) {
                    var content = match.groupValues[1].trim()
                    if ((content.startsWith("\"") && content.endsWith("\"")) || (content.startsWith("'") && content.endsWith("'"))) {
                        content = content.substring(1, content.length - 1)
                    } else if (variables.containsKey(content)) {
                        content = variables[content]!! // Substitute variable value!
                    }
                    outputBuilder.appendLine(content)
                }
            }
            
            var finalOutput = outputBuilder.toString()
            if (finalOutput.isEmpty()) {
                finalOutput = "[Program finished with no output]"
            } else {
                finalOutput = "Running simulated execution...\n----------------------------\n" + finalOutput + "----------------------------\n[Program finished]"
            }
            
            call.respond(ExecuteResponse(finalOutput))
        }
    }
}
