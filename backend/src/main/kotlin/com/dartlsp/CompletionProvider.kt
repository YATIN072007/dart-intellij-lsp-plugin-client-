package com.dartlsp

object CompletionProvider {
    private val keywords = listOf(
        "void", "main", "print", "String", "int", "double", 
        "bool", "dynamic", "var", "final", "const", "class", 
        "if", "else", "for", "while", "return", "import"
    )

    fun getCompletions(code: String, cursor: Int): List<CompletionItem> {
        return keywords.map { CompletionItem(it, "Keyword") }
    }
}
