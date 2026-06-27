plugins {
    kotlin("jvm") version "2.0.0"
    kotlin("plugin.serialization") version "2.0.0"
    application
}

group = "com.confraajuda"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("io.ktor:ktor-server-core:2.3.11")
    implementation("io.ktor:ktor-server-netty:2.3.11")
    implementation("io.ktor:ktor-server-content-negotiation:2.3.11")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.11")
    implementation("io.ktor:ktor-server-cors:2.3.11")
    implementation("io.ktor:ktor-server-status-pages:2.3.11")
    
    // Ktor Client to call the ConfraPix API
    implementation("io.ktor:ktor-client-core:2.3.11")
    implementation("io.ktor:ktor-client-cio:2.3.11")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.11")
    
    implementation("ch.qos.logback:logback-classic:1.4.14")
}

application {
    mainClass.set("com.confraajuda.ApplicationKt")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.jar {
    manifest {
        attributes["Main-Class"] = "com.confraajuda.ApplicationKt"
    }
    val dependencies = configurations.runtimeClasspath.get().map { zipTree(it) }
    from(dependencies)
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
}

