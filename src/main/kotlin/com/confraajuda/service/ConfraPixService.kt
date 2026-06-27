package com.confraajuda.service

import com.confraajuda.model.*
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.util.UUID

class ConfraPixService(
    private val httpClient: HttpClient,
    private val token: String,
    private val apiUrl: String,
    val mockMode: Boolean
) {
    private val logger = LoggerFactory.getLogger(ConfraPixService::class.java)

    // Helper robust function to parse the ConfraPixTransaction
    // It works whether the transaction is inside a wrapper {"transaction": {...}} or directly at the root.
    private fun parseTransaction(bodyText: String): ConfraPixTransaction {
        val json = Json { ignoreUnknownKeys = true }
        val element = json.parseToJsonElement(bodyText)
        if (element is JsonObject) {
            val txElement = element["transaction"]
            if (txElement != null) {
                return json.decodeFromJsonElement(txElement)
            }
        }
        return json.decodeFromJsonElement(element)
    }

    // Helper to find the PIX EMV code from the response.
    // It searches in multiple possible locations based on ConfraPix/BolePix API variations.
    private fun extractPixCode(bodyText: String): String? {
        val json = Json { ignoreUnknownKeys = true }
        try {
            val element = json.parseToJsonElement(bodyText)
            if (element is JsonObject) {
                // 1. Check "pix" -> "code" (Standard ConfraPix response)
                val pixObj = element["pix"]
                if (pixObj is JsonObject) {
                    val code = pixObj["code"]?.jsonPrimitive?.contentOrNull
                    if (!code.isNullOrEmpty()) return code
                }
                
                // 2. Check "bankslip" -> "pix_code" (BolePix response)
                val bankslipObj = element["bankslip"]
                if (bankslipObj is JsonObject) {
                    val pixCode = bankslipObj["pix_code"]?.jsonPrimitive?.contentOrNull
                    if (!pixCode.isNullOrEmpty()) return pixCode
                }

                // 3. Check "transaction" -> "pix_code"
                val txObj = element["transaction"]
                if (txObj is JsonObject) {
                    val pixCode = txObj["pix_code"]?.jsonPrimitive?.contentOrNull
                    if (!pixCode.isNullOrEmpty()) return pixCode
                }

                // 4. Check root level "pix_code"
                val rootPixCode = element["pix_code"]?.jsonPrimitive?.contentOrNull
                if (!rootPixCode.isNullOrEmpty()) return rootPixCode

                // 5. Check root level "code"
                val rootCode = element["code"]?.jsonPrimitive?.contentOrNull
                if (!rootCode.isNullOrEmpty()) return rootCode
            }
        } catch (e: Exception) {
            logger.error("Erro ao extrair pix_code do JSON", e)
        }
        return null
    }

    suspend fun createPixTransaction(
        amount: Double,
        customerName: String,
        customerDocument: String,
        description: String,
        expirationDate: String
    ): Result<ConfraPixTransaction> {
        if (mockMode) {
            val uuid = UUID.randomUUID().toString()
            val fakePixCode = "00020101021226870014br.gov.bcb.pix0136550e8400-e29b-41d4-a716-4466554400000215ConfraAjudaDemo5204000053039865405${String.format("%.2f", amount)}5802BR5911ConfraAjuda6009JoaoPessoa62070503***6304"
            logger.info("[MOCK] Criando transação Pix fake: $uuid")
            return Result.success(ConfraPixTransaction(
                uuid = uuid,
                status = "processing",
                amount = amount,
                pix_code = fakePixCode,
                expiration_date = expirationDate,
                confirmed = false
            ))
        }

        return try {
            logger.info("[API] Enviando requisição para ConfraPix. Valor: R$ $amount")
            val response: HttpResponse = httpClient.post("$apiUrl/transaction-ec/store") {
                header(HttpHeaders.Authorization, "Bearer $token")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(ConfraPixStoreRequest(
                    amount = amount,
                    customer_name = customerName,
                    customer_document = customerDocument,
                    description = description,
                    expiration_date = expirationDate,
                    callback_url = "http://localhost:8080/api/webhook"
                ))
            }

            if (response.status == HttpStatusCode.Created || response.status == HttpStatusCode.OK) {
                val bodyText = response.bodyAsText()
                val transaction = parseTransaction(bodyText)
                val pixCode = extractPixCode(bodyText)
                val finalTransaction = transaction.copy(pix_code = pixCode)
                logger.info("[API] Transação Pix criada no ConfraPix. Codigo Pix extraído: ${pixCode != null}")
                Result.success(finalTransaction)
            } else {
                val errorBody = response.bodyAsText()
                logger.error("[API] Falha no ConfraPix: ${response.status} - $errorBody")
                Result.failure(Exception("Status: ${response.status}. Detalhes: $errorBody"))
            }
        } catch (e: Exception) {
            logger.error("[API] Exceção de conexão com ConfraPix", e)
            Result.failure(e)
        }
    }

    suspend fun getTransactionStatus(uuid: String): Result<ConfraPixTransaction> {
        if (mockMode) {
            return Result.failure(Exception("Mock mode active - query handled locally"))
        }

        return try {
            val response: HttpResponse = httpClient.get("$apiUrl/transaction-ec/show/$uuid") {
                header(HttpHeaders.Authorization, "Bearer $token")
            }

            if (response.status == HttpStatusCode.OK) {
                val bodyText = response.bodyAsText()
                val transaction = parseTransaction(bodyText)
                val pixCode = extractPixCode(bodyText)
                val finalTransaction = transaction.copy(pix_code = pixCode)
                Result.success(finalTransaction)
            } else {
                Result.failure(Exception("Falha na consulta de status real: ${response.status}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
