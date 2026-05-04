package com.dartlsp

import kotlinx.serialization.Serializable

@Serializable
data class AnalyzeRequest(val code: String)

@Serializable
data class Diagnostic(val line: Int, val column: Int, val message: String, val severity: String)

@Serializable
data class AnalyzeResponse(val diagnostics: List<Diagnostic>)

@Serializable
data class CompletionRequest(val code: String, val cursor: Int)

@Serializable
data class CompletionItem(val label: String, val kind: String)

@Serializable
data class CompletionResponse(val completions: List<CompletionItem>)

@Serializable
data class ExecuteResponse(val output: String)
