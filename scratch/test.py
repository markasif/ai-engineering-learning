import os, asyncio
from openai import AsyncOpenAI

async def main():
    client = AsyncOpenAI(
        api_key='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',
        base_url='https://integrate.api.nvidia.com/v1'
    )
    try:
        res = await client.chat.completions.create(
            model='meta/llama-3.1-8b-instruct',
            messages=[{'role': 'user', 'content': 'Hello'}],
            max_tokens=10
        )
        print(res.choices[0].message.content)
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
