namespace Microsoft.Azure.Cosmos.AdsExtensionProxy
{
  using System;
  using StreamJsonRpc;
  public class MessageProcessor
  {
    public MessageProcessor()
    {
    }
    public async Task Main()
    {
      SdkRpcTarget target = new SdkRpcTarget();
      JsonRpc rpc = JsonRpc.Attach(Console.OpenStandardOutput(), Console.OpenStandardInput(), target);
      await rpc.Completion;
    }
  }
}