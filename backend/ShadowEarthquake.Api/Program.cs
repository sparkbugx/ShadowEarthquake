using Microsoft.EntityFrameworkCore;
using ShadowEarthquake.Api.Data;

var builder = WebApplication.CreateBuilder(args);

const string FrontendCors = "Frontend";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:4200"];

builder.Services.AddCors(options => options.AddPolicy(FrontendCors, policy =>
    policy.WithOrigins(allowedOrigins)
        .WithMethods("GET", "POST")
        .AllowAnyHeader()));

var app = builder.Build();

// Auto-apply EF Core migrations on startup.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.MapOpenApi();                       // /openapi/v1.json
app.UseSwaggerUI(o =>                   // /swagger
{
    o.SwaggerEndpoint("/openapi/v1.json", "ShadowEarthquake API v1");
    o.DocumentTitle = "ShadowEarthquake API";
});

app.UseCors(FrontendCors);
app.MapControllers();
app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

app.Run();
