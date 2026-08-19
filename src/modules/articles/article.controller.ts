import { Body, Controller, Post, UseInterceptors } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import z from "zod";
import { FormInterceptor } from "../../libs/form/form.interceptor.js";
import { createFileSchema } from "../../libs/form/file.schema.js";

const articleSchema = z.object({
  title: z.string().min(1).max(64),
  content: z.string(),
  coverImage: createFileSchema({ mimetype: [], collection: "articles", maxSize: 5 * 1024 * 1024 })
})

@Controller("articles")
@AllowAnonymous()
export class ArticleController {
  @Post()
  @UseInterceptors(FormInterceptor)
  public create(@Body({ schema: articleSchema }) body: z.output<typeof articleSchema>) {
    console.log(body)
    return { message: "Ok" }
  }
}
