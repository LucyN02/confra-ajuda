package com.confraajuda.plugins

import com.confraajuda.repository.CampaignRepository
import com.confraajuda.routes.campaignRoutes
import com.confraajuda.routes.donationRoutes
import com.confraajuda.service.DonationService
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.routing.*

fun Application.configureRouting(
    campaignRepository: CampaignRepository,
    donationService: DonationService
) {
    routing {
        // Servir arquivos estáticos do frontend
        staticResources("/", "static")

        // Bind das rotas dinâmicas da API
        route("/api") {
            campaignRoutes(campaignRepository)
            donationRoutes(donationService)
        }
    }
}
