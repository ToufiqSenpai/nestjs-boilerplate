import { Injectable } from "@nestjs/common"
import { AsyncLocalStorage } from "async_hooks"

@Injectable()
export class TransactionContextService<T> {
  private readonly storage = new AsyncLocalStorage<T>()

  public getContext(): T | undefined {
    return this.storage.getStore()
  }

  public run<U>(context: T, callback: () => Promise<U>): Promise<U> {
    return this.storage.run(context, callback)
  }
}
