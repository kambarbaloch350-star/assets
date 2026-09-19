pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        // Tapsell's artifacts live on their own maven
        maven("https://maven.tapsell.ir")
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Tapsell Plus SDK
        maven("https://maven.tapsell.ir")
        // Poolakey (CafeBazaar billing) is published through JitPack
        maven("https://jitpack.io")
    }
}

rootProject.name = "JadooyeAdad"
include(":app")
