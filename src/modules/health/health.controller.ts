import {
  Controller,
  Get,
  OnApplicationShutdown,
  ServiceUnavailableException
} from "@nestjs/common"
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, TypeOrmHealthIndicator } from "@nestjs/terminus"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"

@AllowAnonymous()
@Controller("health")
export class HealthController implements OnApplicationShutdown {
  private shuttingDown = false

  public constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator
  ) {}

  public async onApplicationShutdown(_signal: string): Promise<void> {
    this.shuttingDown = true
  }

  @Get("live")
  @HealthCheck()
  public liveness() {
    return this.health.check([() => this.memory.checkHeap("memory_heap", 500 * 1024 * 1024)])
  }

  @Get("ready")
  @HealthCheck()
  public readiness() {
    if (this.shuttingDown) {
      throw new ServiceUnavailableException("Shutting down")
    }
    return this.health.check([() => this.db.pingCheck("database")])
  }

  @Get("deep")
  @HealthCheck()
  public deep() {
    return this.health.check([
      () => this.db.pingCheck("database"),
      () => this.memory.checkHeap("memory_heap", 500 * 1024 * 1024),
      () => this.memory.checkRSS("memory_rss", 1024 * 1024 * 1024)
    ])
  }
}
