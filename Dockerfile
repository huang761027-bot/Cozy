# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["Cozy/Cozy.csproj", "Cozy/"]
RUN dotnet restore "Cozy/Cozy.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/Cozy"
RUN dotnet publish "Cozy.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Railway dynamic port
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Cozy.dll"]
