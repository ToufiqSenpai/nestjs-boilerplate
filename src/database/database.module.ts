import { Global, Module, type OnApplicationShutdown } from "@nestjs/common"
import { DataSource } from "typeorm"
import { UnitOfWork } from "./transaction/unit-of-work.js"
import datasource from "./datasource.js"

@Module({
  providers: [
    {
      provide: DataSource,
      useFactory: async (): Promise<DataSource> => {
        if (!datasource.isInitialized) {
          await datasource.initialize()
        }
        return datasource
      }
    },
    UnitOfWork
  ],
  exports: [DataSource, UnitOfWork]
})
@Global()
export class DatabaseModule implements OnApplicationShutdown {
  public async onApplicationShutdown(): Promise<void> {
    if (datasource.isInitialized) {
      await datasource.destroy()
    }
  }
}
